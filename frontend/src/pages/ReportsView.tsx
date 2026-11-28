import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  FileText, Play, Download, Save, Plus, Trash2, ChevronRight,
  ChevronDown, ChevronUp, GripVertical, Database, Filter, Layers, ArrowUpDown, Palette,
  Eye, Copy, FileSpreadsheet, FileCode, Check, RefreshCw, X,
  Grid, ListFilter, SlidersHorizontal, Share2, History, Clock, Calendar
} from 'lucide-react';
import type { RootState } from '../store';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

interface DataSource {
  key: string;
  label: string;
  description: string;
}

interface FieldNode {
  name: string;
  path: string;
  label: string;
  type: string;
  relation_type?: string;
  related_model?: string;
  nullable?: boolean;
  choices?: { value: any; label: string }[];
  children?: FieldNode[];
  is_aggregatable?: boolean;
}

interface ColumnConfig {
  path: string;
  label: string;
  type?: string;
  width?: number;
  alignment?: 'left' | 'center' | 'right';
  format?: string;
}

interface FilterCondition {
  path: string;
  operator: string;
  value: any;
}

interface FilterGroup {
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
}

interface SortItem {
  path: string;
  direction: 'asc' | 'desc';
}

interface AggregationItem {
  path: string;
  function: 'count' | 'sum' | 'avg' | 'min' | 'max';
  label: string;
}

interface ComparisonConfig {
  enabled: boolean;
  type: 'previous_month' | 'previous_year' | 'custom';
  date_field: string;
  custom_period_a?: [string, string];
  custom_period_b?: [string, string];
}

interface ReportDefinition {
  report_id?: number;
  name: string;
  description: string;
  data_source: string;
  definition: {
    columns: ColumnConfig[];
    filters: FilterGroup;
    sorting: SortItem[];
    grouping?: {
      fields: string[];
      aggregations: AggregationItem[];
    };
    aggregations?: AggregationItem[];
    comparison?: ComparisonConfig;
    watermark_text?: string;
    enable_qr?: boolean;
    enable_signatures?: boolean;
  };
  theme?: string;
  page_orientation?: 'portrait' | 'landscape';
  page_size?: 'A4' | 'A3' | 'Letter';
}

const DEFAULT_THEMES = [
  { key: 'corporate_blue', label: 'Corporate Blue', color: 'bg-blue-900' },
  { key: 'maintenance', label: 'Maintenance Dark', color: 'bg-slate-900' },
  { key: 'finance', label: 'Finance Emerald', color: 'bg-emerald-900' },
  { key: 'minimal', label: 'Minimal Light', color: 'bg-gray-200' },
  { key: 'executive', label: 'Executive Purple', color: 'bg-purple-950' },
];

export const ReportsView: React.FC = () => {
  const { subpage } = useParams<{ subpage: string }>();
  const navigate = useNavigate();
  const token = useSelector((state: RootState) => state.auth.token);

  // View state: 'list' | 'builder' | 'history'
  const [mode, setMode] = useState<'list' | 'builder' | 'history'>('list');

  // List data
  const [savedReports, setSavedReports] = useState<any[]>([]);
  const [prebuiltTemplates, setPrebuiltTemplates] = useState<any[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Audit Logs data
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Sharing Modal state
  const [showShareModal, setShowShareModal] = useState(false);

  // Builder data
  const [sources, setSources] = useState<DataSource[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [fieldTree, setFieldTree] = useState<FieldNode[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);

  // Active Report Definition
  const [reportDef, setReportDef] = useState<ReportDefinition>({
    name: 'New Custom Report',
    description: '',
    data_source: '',
    definition: {
      columns: [],
      filters: { logic: 'AND', conditions: [] },
      sorting: [],
      aggregations: [],
    },
    theme: 'corporate_blue',
    page_orientation: 'portrait',
    page_size: 'A4',
  });

  // Active Tab in Builder
  const [activeTab, setActiveTab] = useState<'columns' | 'filters' | 'grouping' | 'layout'>('columns');

  // Preview State
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Export State
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);

  // Search filter for field tree & mobile builder tab switcher
  const [fieldSearch, setFieldSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [mobileTab, setMobileTab] = useState<'fields' | 'config' | 'preview'>('fields');

  // Drag and Drop state for Columns & Filters reordering
  const [draggedColIndex, setDraggedColIndex] = useState<number | null>(null);
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null);

  const [draggedFilterIndex, setDraggedFilterIndex] = useState<number | null>(null);
  const [dragOverFilterIndex, setDragOverFilterIndex] = useState<number | null>(null);

  const moveColumn = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= reportDef.definition.columns.length) return;
    setReportDef(prev => {
      const cols = [...prev.definition.columns];
      const [moved] = cols.splice(fromIndex, 1);
      cols.splice(toIndex, 0, moved);
      return { ...prev, definition: { ...prev.definition, columns: cols } };
    });
  };

  const handleColumnDrop = (dropIndex: number) => {
    if (draggedColIndex === null || draggedColIndex === dropIndex) return;
    setReportDef(prev => {
      const cols = [...prev.definition.columns];
      const [moved] = cols.splice(draggedColIndex, 1);
      cols.splice(dropIndex, 0, moved);
      return { ...prev, definition: { ...prev.definition, columns: cols } };
    });
    setDraggedColIndex(null);
    setDragOverColIndex(null);
  };

  const moveFilter = (fromIndex: number, direction: -1 | 1) => {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= reportDef.definition.filters.conditions.length) return;
    setReportDef(prev => {
      const conds = [...prev.definition.filters.conditions];
      const [moved] = conds.splice(fromIndex, 1);
      conds.splice(toIndex, 0, moved);
      return {
        ...prev,
        definition: {
          ...prev.definition,
          filters: { ...prev.definition.filters, conditions: conds },
        },
      };
    });
  };

  const handleFilterDrop = (dropIndex: number) => {
    if (draggedFilterIndex === null || draggedFilterIndex === dropIndex) return;
    setReportDef(prev => {
      const conds = [...prev.definition.filters.conditions];
      const [moved] = conds.splice(draggedFilterIndex, 1);
      conds.splice(dropIndex, 0, moved);
      return {
        ...prev,
        definition: {
          ...prev.definition,
          filters: { ...prev.definition.filters, conditions: conds },
        },
      };
    });
    setDraggedFilterIndex(null);
    setDragOverFilterIndex(null);
  };

  useEffect(() => {
    fetchSavedReports();
    fetchPrebuiltTemplates();
    fetchDataSources();
  }, [token]);

  useEffect(() => {
    if (subpage === 'history') {
      fetchLogs();
      setMode('history');
    } else if (subpage === 'new') {
      setMode('builder');
    } else if (subpage === 'all') {
      setMode('list');
    }
  }, [subpage]);

  const fetchPrebuiltTemplates = async () => {
    try {
      const res = await fetch(`${API_URL}/reports/templates/`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setPrebuiltTemplates(data);
      }
    } catch (err) {
      console.error('Failed to load prebuilt templates', err);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await fetch(`${API_URL}/reports/logs/`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (selectedSource) {
      fetchFieldTree(selectedSource);
    }
  }, [selectedSource, token]);

  const authHeaders = {
    'Authorization': `Token ${token}`,
    'Content-Type': 'application/json',
  };

  const fetchSavedReports = async () => {
    setLoadingList(true);
    try {
      const res = await fetch(`${API_URL}/reports/definitions/`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setSavedReports(data);
      }
    } catch (err) {
      console.error('Failed to load saved reports', err);
    } finally {
      setLoadingList(false);
    }
  };

  const fetchDataSources = async () => {
    try {
      const res = await fetch(`${API_URL}/reports/sources/`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setSources(data);
      }
    } catch (err) {
      console.error('Failed to load data sources', err);
    }
  };

  const fetchFieldTree = async (sourceKey: string) => {
    setLoadingFields(true);
    try {
      const res = await fetch(`${API_URL}/reports/sources/${sourceKey}/fields/`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setFieldTree(data.fields || []);
      }
    } catch (err) {
      console.error('Failed to load field tree', err);
    } finally {
      setLoadingFields(false);
    }
  };

  const handleSelectSource = (sourceKey: string) => {
    setSelectedSource(sourceKey);
    setReportDef(prev => ({
      ...prev,
      data_source: sourceKey,
      definition: {
        columns: [],
        filters: { logic: 'AND', conditions: [] },
        sorting: [],
        aggregations: [],
      }
    }));
    setPreviewResult(null);
  };

  const toggleNodeExpand = (path: string) => {
    setExpandedNodes(prev => ({ ...prev, [path]: !prev[path] }));
  };

  // Field Selection Helpers
  const addColumn = (field: FieldNode) => {
    if (reportDef.definition.columns.some(c => c.path === field.path)) return;
    const newCol: ColumnConfig = {
      path: field.path,
      label: field.label,
      type: field.type,
      alignment: field.is_aggregatable ? 'right' : 'left',
    };
    setReportDef(prev => ({
      ...prev,
      definition: {
        ...prev.definition,
        columns: [...prev.definition.columns, newCol],
      }
    }));
  };

  const removeColumn = (path: string) => {
    setReportDef(prev => ({
      ...prev,
      definition: {
        ...prev.definition,
        columns: prev.definition.columns.filter(c => c.path !== path),
      }
    }));
  };

  // Filter Helpers
  const addFilter = () => {
    const defaultField = fieldTree[0]?.path || '';
    setReportDef(prev => ({
      ...prev,
      definition: {
        ...prev.definition,
        filters: {
          ...prev.definition.filters,
          conditions: [
            ...prev.definition.filters.conditions,
            { path: defaultField, operator: 'equals', value: '' },
          ]
        }
      }
    }));
  };

  const updateFilter = (index: number, key: keyof FilterCondition, val: any) => {
    setReportDef(prev => {
      const updated = [...prev.definition.filters.conditions];
      updated[index] = { ...updated[index], [key]: val };
      return {
        ...prev,
        definition: {
          ...prev.definition,
          filters: { ...prev.definition.filters, conditions: updated }
        }
      };
    });
  };

  const removeFilter = (index: number) => {
    setReportDef(prev => ({
      ...prev,
      definition: {
        ...prev.definition,
        filters: {
          ...prev.definition.filters,
          conditions: prev.definition.filters.conditions.filter((_, i) => i !== index),
        }
      }
    }));
  };

  // Sorting Helpers
  const addSort = () => {
    const defaultField = reportDef.definition.columns[0]?.path || fieldTree[0]?.path || '';
    setReportDef(prev => ({
      ...prev,
      definition: {
        ...prev.definition,
        sorting: [...prev.definition.sorting, { path: defaultField, direction: 'asc' }],
      }
    }));
  };

  const removeSort = (index: number) => {
    setReportDef(prev => ({
      ...prev,
      definition: {
        ...prev.definition,
        sorting: prev.definition.sorting.filter((_, i) => i !== index),
      }
    }));
  };

  // Execute Preview
  const runPreview = async () => {
    if (!selectedSource) return;
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const res = await fetch(`${API_URL}/reports/preview/`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          data_source: selectedSource,
          definition: reportDef.definition,
          format: 'preview',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setPreviewResult(data);
      } else {
        setPreviewError(data.detail || 'Failed to generate preview');
      }
    } catch (err) {
      setPreviewError('Network error while executing report preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Export Document
  const triggerExport = async (fmt: 'pdf' | 'excel' | 'csv') => {
    if (!selectedSource) return;
    setExportingFormat(fmt);

    try {
      const res = await fetch(`${API_URL}/reports/export/`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          data_source: selectedSource,
          definition: {
            ...reportDef.definition,
            name: reportDef.name,
            description: reportDef.description,
            theme: reportDef.theme,
            page_orientation: reportDef.page_orientation,
            page_size: reportDef.page_size,
          },
          format: fmt,
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${reportDef.name.toLowerCase().replace(/\s+/g, '_')}.${fmt === 'excel' ? 'xlsx' : fmt}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Export failed: ${errData.detail || 'Server error (' + res.status + ')'}`);
      }
    } catch (err) {
      alert('Network error during export.');
    } finally {
      setExportingFormat(null);
    }
  };

  // Save Report Definition
  const saveReport = async () => {
    if (!reportDef.name.trim()) {
      alert('Please enter a report title.');
      return;
    }

    try {
      const url = reportDef.report_id
        ? `${API_URL}/reports/definitions/${reportDef.report_id}/`
        : `${API_URL}/reports/definitions/`;
      const method = reportDef.report_id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(reportDef),
      });

      if (res.ok) {
        const saved = await res.json();
        setReportDef(saved);
        alert('Report saved successfully!');
        fetchSavedReports();
      } else {
        alert('Failed to save report.');
      }
    } catch (err) {
      alert('Error saving report.');
    }
  };

  // Render Recursive Field Tree
  const renderFieldTreeNodes = (nodes: FieldNode[]) => {
    return nodes.map(node => {
      const hasChildren = Boolean(node.children && node.children.length > 0);
      const isRelation = (node.type === 'relation' || node.type === 'reverse_relation') && hasChildren;
      const isExpanded = expandedNodes[node.path];
      const isSelected = reportDef.definition.columns.some(c => c.path === node.path);

      if (fieldSearch && !node.label.toLowerCase().includes(fieldSearch.toLowerCase()) && !node.path.toLowerCase().includes(fieldSearch.toLowerCase())) {
        if (!node.children || !node.children.some(c => c.label.toLowerCase().includes(fieldSearch.toLowerCase()))) {
          return null;
        }
      }

      return (
        <div key={node.path} className="text-xs">
          <div
            className={`flex items-center justify-between px-2 py-1 rounded hover:bg-surface-container-high cursor-pointer transition-colors ${isSelected ? 'bg-primary/10 text-primary font-medium' : ''
              }`}
          >
            <div
              className="flex items-center gap-1.5 flex-1 min-w-0"
              onClick={() => isRelation ? toggleNodeExpand(node.path) : addColumn(node)}
            >
              {isRelation ? (
                <button type="button" className="p-0.5 text-on-surface-variant hover:text-on-surface">
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </button>
              ) : (
                <span className="w-3.5 h-3.5 text-on-surface-variant  text-[9px] flex items-center justify-center">
                  {node.type === 'integer' || node.type === 'decimal' ? '#' : node.type === 'date' || node.type === 'datetime' ? '📅' : 'T'}
                </span>
              )}

              <span className="truncate" title={node.path}>{node.label}</span>
              {isRelation && (
                <span className="text-[9px] px-1 bg-surface-container rounded text-on-surface-variant">
                  {node.relation_type === 'one_to_many' ? '1:N' : 'FK'}
                </span>
              )}
            </div>

            {!isRelation && (
              <button
                type="button"
                onClick={() => isSelected ? removeColumn(node.path) : addColumn(node)}
                className={`p-1 rounded text-[10px] transition-colors ${isSelected ? 'text-red-500 hover:bg-red-500/10' : 'text-primary hover:bg-primary/10'
                  }`}
              >
                {isSelected ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              </button>
            )}
          </div>

          {isRelation && isExpanded && node.children && (
            <div className="ml-3 pl-2 border-l border-outline-variant/50 space-y-0.5 my-0.5">
              {renderFieldTreeNodes(node.children)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full bg-surface text-on-surface select-none">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 sm:px-6 py-3 border-b border-outline-variant bg-surface-container-low shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-semibold text-sm sm:text-base tracking-tight leading-tight truncate">
              Universal Report Builder
            </h1>
            <p className="text-[11px] sm:text-xs text-on-surface-variant mt-0.5 truncate">
              Metadata-driven dynamic PDF, Excel, and CSV reporting engine
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto justify-start sm:justify-end">
          {mode === 'builder' ? (
            <>
              <button
                onClick={() => setMode('list')}
                className="px-2.5 sm:px-3 py-1.5 rounded border border-outline-variant text-xs font-medium hover:bg-surface-container-high transition-colors"
              >
                Saved Reports
              </button>
              <button
                onClick={runPreview}
                disabled={previewLoading || !selectedSource}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {previewLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                Run Preview
              </button>
              <button
                onClick={saveReport}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded border border-primary text-primary text-xs font-medium hover:bg-primary/10 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                Save Report
              </button>
            </>
          ) : mode === 'history' ? (
            <button
              onClick={() => setMode('list')}
              className="px-3 py-1.5 rounded border border-outline-variant text-xs font-medium hover:bg-surface-container-high transition-colors"
            >
              Saved Reports
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  fetchLogs();
                  setMode('history');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-outline-variant text-xs font-medium hover:bg-surface-container-high transition-colors"
              >
                <History className="w-3.5 h-3.5" />
                Audit Logs
              </button>
              <button
                onClick={() => {
                  setReportDef({
                    name: 'New Custom Report',
                    description: '',
                    data_source: '',
                    definition: { columns: [], filters: { logic: 'AND', conditions: [] }, sorting: [], aggregations: [] },
                    theme: 'corporate_blue',
                    page_orientation: 'portrait',
                    page_size: 'A4',
                  });
                  setSelectedSource('');
                  setPreviewResult(null);
                  setMode('builder');
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 sm:py-2 rounded bg-primary text-on-primary text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create New Report
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {mode === 'list' ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {/* Pre-built Templates Section */}
          {prebuiltTemplates.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                    Standard Pre-built Templates
                  </h2>
                  <p className="text-xs text-on-surface-variant/70">
                    Ready-to-use report blueprints for maintenance, financial, and workforce reporting.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {prebuiltTemplates.map(tpl => (
                  <div
                    key={tpl.id}
                    className="p-4 rounded border border-primary/20 bg-primary/5 hover:border-primary transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-primary text-on-primary">
                          {tpl.category}
                        </span>
                        <span className="text-[10px] text-on-surface-variant ">{tpl.data_source}</span>
                      </div>
                      <h3 className="font-semibold text-sm text-on-surface mb-1">{tpl.name}</h3>
                      <p className="text-xs text-on-surface-variant line-clamp-2 mb-3">{tpl.description}</p>
                    </div>

                    <button
                      onClick={() => {
                        setReportDef({
                          name: tpl.name,
                          description: tpl.description,
                          data_source: tpl.data_source,
                          definition: tpl.definition,
                          theme: tpl.theme,
                          page_orientation: tpl.page_orientation,
                          page_size: tpl.page_size,
                        });
                        setSelectedSource(tpl.data_source);
                        setMode('builder');
                      }}
                      className="w-full py-1.5 bg-primary text-on-primary rounded text-xs font-semibold hover:bg-primary/90 transition-colors text-center"
                    >
                      Use Template
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* User Saved Reports Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                Saved Custom Reports ({savedReports.length})
              </h2>
            </div>

            {loadingList ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : savedReports.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-outline-variant rounded-xl">
                <FileText className="w-10 h-10 text-on-surface-variant/40 mx-auto mb-2" />
                <p className="text-xs font-medium text-on-surface">No saved custom reports yet</p>
                <p className="text-[11px] text-on-surface-variant mt-0.5">Use a pre-built template above or click "Create New Report" to design one.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {savedReports.map(report => (
                  <div
                    key={report.report_id}
                    className="p-4 rounded border border-outline-variant bg-surface-container-low hover:border-primary/50 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary">
                          {report.data_source}
                        </span>
                        <span className="text-[10px] text-on-surface-variant">v{report.version}</span>
                      </div>
                      <h3 className="font-semibold text-sm text-on-surface mb-1">{report.name}</h3>
                      {report.description && (
                        <p className="text-xs text-on-surface-variant line-clamp-2 mb-3">{report.description}</p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-outline-variant/60 flex items-center justify-between text-xs text-on-surface-variant">
                      <span>By {report.created_by_name}</span>
                      <button
                        onClick={() => {
                          setReportDef(report);
                          setSelectedSource(report.data_source);
                          setMode('builder');
                        }}
                        className="px-3 py-1 bg-primary text-on-primary rounded font-medium hover:bg-primary/90 transition-colors text-[11px]"
                      >
                        Open Builder
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : mode === 'history' ? (
        /* Audit History Logs View */
        <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                Report Generation Audit Logs
              </h2>
              <p className="text-xs text-on-surface-variant/70">
                Complete execution history, execution durations, row counts, and exported formats.
              </p>
            </div>
            <button
              onClick={fetchLogs}
              className="p-1.5 rounded-lg border border-outline-variant hover:bg-surface-container-high transition-colors"
              title="Refresh logs"
            >
              <RefreshCw className="w-4 h-4 text-on-surface-variant" />
            </button>
          </div>

          {loadingLogs ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-outline-variant rounded-xl">
              <History className="w-10 h-10 text-on-surface-variant/40 mx-auto mb-2" />
              <p className="text-xs font-medium text-on-surface">No generation audit logs recorded yet</p>
            </div>
          ) : (
            <div className="bg-surface rounded-xl border border-outline-variant shadow-sm overflow-x-auto text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-high border-b border-outline-variant font-semibold text-on-surface text-[11px]">
                    <th className="p-3">Log ID</th>
                    <th className="p-3">Report Name</th>
                    <th className="p-3">Data Source</th>
                    <th className="p-3">Format</th>
                    <th className="p-3">Rows</th>
                    <th className="p-3">Duration</th>
                    <th className="p-3">Generated By</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/40">
                  {logs.map(log => (
                    <tr key={log.log_id} className="hover:bg-surface-container-low transition-colors">
                      <td className="p-3  text-[10px] text-on-surface-variant">#{log.log_id}</td>
                      <td className="p-3 font-semibold text-on-surface">{log.report_name}</td>
                      <td className="p-3  text-[10px] text-primary">{log.data_source}</td>
                      <td className="p-3">
                        <span className={`uppercase font-bold text-[9px] px-2 py-0.5 rounded ${log.export_format === 'pdf' ? 'bg-red-500/10 text-red-600' :
                          log.export_format === 'excel' ? 'bg-emerald-500/10 text-emerald-600' :
                            log.export_format === 'csv' ? 'bg-blue-500/10 text-blue-600' : 'bg-gray-500/10 text-gray-600'
                          }`}>
                          {log.export_format}
                        </span>
                      </td>
                      <td className="p-3 ">{log.row_count.toLocaleString()}</td>
                      <td className="p-3  text-[11px] text-on-surface-variant">{log.duration_ms} ms</td>
                      <td className="p-3">{log.generated_by_name}</td>
                      <td className="p-3 text-on-surface-variant text-[11px]">
                        {new Date(log.generated_date).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Builder View */
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* Mobile View Switcher Tabs (< lg screens) */}
          <div className="flex lg:hidden border-b border-outline-variant bg-surface-container text-xs font-medium shrink-0">
            <button
              onClick={() => setMobileTab('fields')}
              className={`flex-1 py-2 text-center transition-colors border-b-2 ${mobileTab === 'fields' ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant'
                }`}
            >
              1. Fields
            </button>
            <button
              onClick={() => setMobileTab('config')}
              className={`flex-1 py-2 text-center transition-colors border-b-2 ${mobileTab === 'config' ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant'
                }`}
            >
              2. Settings
            </button>
            <button
              onClick={() => setMobileTab('preview')}
              className={`flex-1 py-2 text-center transition-colors border-b-2 ${mobileTab === 'preview' ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant'
                }`}
            >
              3. Preview
            </button>
          </div>

          {/* Left Panel: Field Browser */}
          <div className={`w-full lg:w-56 xl:w-64 2xl:w-72 border-b lg:border-b-0 lg:border-r border-outline-variant bg-surface-container-low ${mobileTab === 'fields' ? 'flex' : 'hidden lg:flex'} flex-col shrink-0 overflow-y-auto lg:overflow-hidden`}>
            <div className="p-3 border-b border-outline-variant space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant block">
                1. Select Data Source
              </label>
              <select
                value={selectedSource}
                onChange={e => handleSelectSource(e.target.value)}
                className="w-full text-xs px-2.5 py-1.5 rounded border border-outline-variant bg-surface text-on-surface focus:outline-none focus:border-primary"
              >
                <option value="">-- Choose Data Source --</option>
                {sources.map(src => (
                  <option key={src.key} value={src.key}>
                    {src.label} ({src.key})
                  </option>
                ))}
              </select>
            </div>

            {selectedSource && (
              <>
                <div className="p-3 border-b border-outline-variant space-y-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant block">
                    2. Browse Available Fields
                  </label>
                  <input
                    type="text"
                    placeholder="Filter fields..."
                    value={fieldSearch}
                    onChange={e => setFieldSearch(e.target.value)}
                    className="w-full text-xs px-2.5 py-1.5 rounded border border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-0.5 scrollbar-thin">
                  {loadingFields ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                    </div>
                  ) : (
                    renderFieldTreeNodes(fieldTree)
                  )}
                </div>
              </>
            )}
          </div>

          {/* Middle Panel: Config Tabs & Controls */}
          <div className={`w-full lg:w-72 xl:w-80 2xl:w-96 border-b lg:border-b-0 lg:border-r border-outline-variant bg-surface-container-low ${mobileTab === 'config' ? 'flex' : 'hidden lg:flex'} flex-col shrink-0 overflow-y-auto lg:overflow-hidden`}>
            {/* Report Metadata inputs */}
            <div className="p-3 border-b border-outline-variant space-y-2">
              <input
                type="text"
                value={reportDef.name}
                onChange={e => setReportDef(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Report Name"
                className="w-full text-xs font-semibold px-2.5 py-1.5 rounded border border-outline-variant bg-surface text-on-surface focus:outline-none focus:border-primary"
              />
              <input
                type="text"
                value={reportDef.description}
                onChange={e => setReportDef(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Report Subtitle / Description"
                className="w-full text-[11px] px-2.5 py-1 rounded border border-outline-variant bg-surface text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
              />
            </div>

            {/* Config Tabs Header */}
            <div className="flex border-b border-outline-variant bg-surface-container text-xs font-medium">
              <button
                onClick={() => setActiveTab('columns')}
                className={`flex-1 py-2 text-center transition-colors border-b-2 ${activeTab === 'columns' ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
              >
                Columns ({reportDef.definition.columns.length})
              </button>
              <button
                onClick={() => setActiveTab('filters')}
                className={`flex-1 py-2 text-center transition-colors border-b-2 ${activeTab === 'filters' ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
              >
                Filters ({reportDef.definition.filters.conditions.length})
              </button>
              <button
                onClick={() => setActiveTab('grouping')}
                className={`flex-1 py-2 text-center transition-colors border-b-2 ${activeTab === 'grouping' ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
              >
                Sort & Group
              </button>
              <button
                onClick={() => setActiveTab('layout')}
                className={`flex-1 py-2 text-center transition-colors border-b-2 ${activeTab === 'layout' ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
              >
                Theme
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
              {/* COLUMNS TAB */}
              {activeTab === 'columns' && (
                <div className="space-y-2">
                  <div className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider">
                    Selected Report Columns ({reportDef.definition.columns.length})
                  </div>
                  {reportDef.definition.columns.length === 0 ? (
                    <p className="text-xs text-on-surface-variant/70 italic py-4 text-center">
                      No columns selected yet. Click fields in the left panel to add them.
                    </p>
                  ) : (
                    reportDef.definition.columns.map((col, idx) => (
                      <div
                        key={col.path}
                        draggable
                        onDragStart={() => setDraggedColIndex(idx)}
                        onDragOver={e => {
                          e.preventDefault();
                          setDragOverColIndex(idx);
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          handleColumnDrop(idx);
                        }}
                        onDragEnd={() => {
                          setDraggedColIndex(null);
                          setDragOverColIndex(null);
                        }}
                        className={`p-2 rounded border transition-all space-y-1.5 text-xs ${draggedColIndex === idx
                          ? 'opacity-40 border-dashed border-primary bg-primary/5'
                          : dragOverColIndex === idx
                            ? 'border-primary ring-2 ring-primary/20 bg-surface'
                            : 'border-outline-variant bg-surface hover:border-primary/40'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <GripVertical className="w-3.5 h-3.5 text-on-surface-variant/50 shrink-0 cursor-grab active:cursor-grabbing" />
                            <span className=" text-[10px] text-primary truncate max-w-[150px]" title={col.path}>
                              {col.path}
                            </span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => moveColumn(idx, -1)}
                              disabled={idx === 0}
                              className="text-on-surface-variant hover:text-primary disabled:opacity-20 p-0.5"
                              title="Move Up"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => moveColumn(idx, 1)}
                              disabled={idx === reportDef.definition.columns.length - 1}
                              className="text-on-surface-variant hover:text-primary disabled:opacity-20 p-0.5"
                              title="Move Down"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => removeColumn(col.path)}
                              className="text-red-500 hover:text-red-700 p-0.5 ml-1"
                              title="Remove Column"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[9px] text-on-surface-variant block">Header Label</label>
                            <input
                              type="text"
                              value={col.label}
                              onChange={e => {
                                const val = e.target.value;
                                setReportDef(prev => {
                                  const cols = [...prev.definition.columns];
                                  cols[idx] = { ...cols[idx], label: val };
                                  return { ...prev, definition: { ...prev.definition, columns: cols } };
                                });
                              }}
                              className="w-full text-[11px] px-1.5 py-0.5 rounded border border-outline-variant bg-surface-container"
                            />
                          </div>

                          <div>
                            <label className="text-[9px] text-on-surface-variant block">Align</label>
                            <select
                              value={col.alignment || 'left'}
                              onChange={e => {
                                const val = e.target.value as any;
                                setReportDef(prev => {
                                  const cols = [...prev.definition.columns];
                                  cols[idx] = { ...cols[idx], alignment: val };
                                  return { ...prev, definition: { ...prev.definition, columns: cols } };
                                });
                              }}
                              className="w-full text-[11px] px-1.5 py-0.5 rounded border border-outline-variant bg-surface-container"
                            >
                              <option value="left">Left</option>
                              <option value="center">Center</option>
                              <option value="right">Right</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* FILTERS TAB */}
              {activeTab === 'filters' && (
                <div className="space-y-4">
                  {/* Period-over-Period Comparison Box */}
                  <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Period Comparison Mode</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={reportDef.definition.comparison?.enabled || false}
                        onChange={e => {
                          const checked = e.target.checked;
                          setReportDef(prev => ({
                            ...prev,
                            definition: {
                              ...prev.definition,
                              comparison: {
                                enabled: checked,
                                type: prev.definition.comparison?.type || 'previous_month',
                                date_field: prev.definition.comparison?.date_field || (prev.definition.columns[0]?.path || 'created_date'),
                              },
                            },
                          }));
                        }}
                        className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4"
                      />
                    </div>

                    {reportDef.definition.comparison?.enabled && (
                      <div className="space-y-2 text-xs pt-1 border-t border-primary/10">
                        <div>
                          <label className="text-[9px] text-on-surface-variant block mb-0.5 font-medium">Comparison Mode</label>
                          <select
                            value={reportDef.definition.comparison?.type || 'previous_month'}
                            onChange={e => {
                              const val = e.target.value as any;
                              setReportDef(prev => ({
                                ...prev,
                                definition: {
                                  ...prev.definition,
                                  comparison: { ...prev.definition.comparison!, type: val },
                                },
                              }));
                            }}
                            className="w-full text-[11px] px-2 py-1 rounded border border-outline-variant bg-surface"
                          >
                            <option value="previous_month">Current Month vs Previous Month</option>
                            <option value="previous_year">Current Year vs Previous Year</option>
                            <option value="custom">Custom Date Ranges</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[9px] text-on-surface-variant block mb-0.5 font-medium">Comparison Date Field</label>
                          <select
                            value={reportDef.definition.comparison?.date_field || 'created_date'}
                            onChange={e => {
                              const val = e.target.value;
                              setReportDef(prev => ({
                                ...prev,
                                definition: {
                                  ...prev.definition,
                                  comparison: { ...prev.definition.comparison!, date_field: val },
                                },
                              }));
                            }}
                            className="w-full text-[11px] px-2 py-1 rounded border border-outline-variant bg-surface"
                          >
                            {reportDef.definition.columns.map(c => (
                              <option key={c.path} value={c.path}>{c.label} ({c.path})</option>
                            ))}
                          </select>
                        </div>

                        {reportDef.definition.comparison?.type === 'custom' && (
                          <div className="space-y-2 pt-1.5 border-t border-primary/10">
                            <div>
                              <label className="text-[9px] text-on-surface-variant font-medium block">Period A Range (Current)</label>
                              <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                                <input
                                  type="date"
                                  value={reportDef.definition.comparison?.custom_period_a?.[0] || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setReportDef(prev => ({
                                      ...prev,
                                      definition: {
                                        ...prev.definition,
                                        comparison: {
                                          ...prev.definition.comparison!,
                                          custom_period_a: [val, prev.definition.comparison?.custom_period_a?.[1] || ''],
                                        },
                                      },
                                    }));
                                  }}
                                  className="text-[10px] px-1.5 py-1 rounded border border-outline-variant bg-surface"
                                />
                                <input
                                  type="date"
                                  value={reportDef.definition.comparison?.custom_period_a?.[1] || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setReportDef(prev => ({
                                      ...prev,
                                      definition: {
                                        ...prev.definition,
                                        comparison: {
                                          ...prev.definition.comparison!,
                                          custom_period_a: [prev.definition.comparison?.custom_period_a?.[0] || '', val],
                                        },
                                      },
                                    }));
                                  }}
                                  className="text-[10px] px-1.5 py-1 rounded border border-outline-variant bg-surface"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[9px] text-on-surface-variant font-medium block">Period B Range (Compare To)</label>
                              <div className="grid grid-cols-2 gap-1.5 mt-0.5">
                                <input
                                  type="date"
                                  value={reportDef.definition.comparison?.custom_period_b?.[0] || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setReportDef(prev => ({
                                      ...prev,
                                      definition: {
                                        ...prev.definition,
                                        comparison: {
                                          ...prev.definition.comparison!,
                                          custom_period_b: [val, prev.definition.comparison?.custom_period_b?.[1] || ''],
                                        },
                                      },
                                    }));
                                  }}
                                  className="text-[10px] px-1.5 py-1 rounded border border-outline-variant bg-surface"
                                />
                                <input
                                  type="date"
                                  value={reportDef.definition.comparison?.custom_period_b?.[1] || ''}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setReportDef(prev => ({
                                      ...prev,
                                      definition: {
                                        ...prev.definition,
                                        comparison: {
                                          ...prev.definition.comparison!,
                                          custom_period_b: [prev.definition.comparison?.custom_period_b?.[0] || '', val],
                                        },
                                      },
                                    }));
                                  }}
                                  className="text-[10px] px-1.5 py-1 rounded border border-outline-variant bg-surface"
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quick Date Presets & Custom Range Bar */}
                  <div className="p-2.5 rounded-lg border border-outline-variant bg-surface space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-primary" /> Quick Date Filter & Custom Range
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { label: 'This Month', op: 'this_month' },
                        { label: 'Last Month', op: 'last_month' },
                        { label: 'This Year', op: 'this_year' },
                        { label: 'Last Year', op: 'last_year' },
                      ].map(preset => (
                        <button
                          key={preset.op}
                          type="button"
                          onClick={() => {
                            const dateCol = reportDef.definition.columns.find(c => c.path.toLowerCase().includes('date') || c.path.toLowerCase().includes('created') || c.path.toLowerCase().includes('work') || c.path.toLowerCase().includes('expense'))?.path || 'created_date';
                            setReportDef(prev => {
                              const conds = prev.definition.filters.conditions.filter(c => c.path !== dateCol);
                              return {
                                ...prev,
                                definition: {
                                  ...prev.definition,
                                  filters: {
                                    ...prev.definition.filters,
                                    conditions: [...conds, { path: dateCol, operator: preset.op, value: 'true' }]
                                  }
                                }
                              };
                            });
                          }}
                          className="text-[10px] px-2 py-0.5 rounded bg-surface-container hover:bg-primary/10 hover:text-primary transition-colors border border-outline-variant/60 font-medium"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <div className="pt-1 border-t border-outline-variant/50 grid grid-cols-2 gap-1.5 text-xs">
                      <div>
                        <span className="text-[9px] font-medium text-on-surface-variant block">From Date</span>
                        <input
                          type="date"
                          onChange={e => {
                            const start = e.target.value;
                            if (!start) return;
                            const dateCol = reportDef.definition.columns.find(c => c.path.toLowerCase().includes('date') || c.path.toLowerCase().includes('created') || c.path.toLowerCase().includes('work') || c.path.toLowerCase().includes('expense'))?.path || 'created_date';
                            setReportDef(prev => {
                              const existing = prev.definition.filters.conditions.find(c => c.path === dateCol && c.operator === 'range');
                              const endVal = existing && Array.isArray(existing.value) ? existing.value[1] || '' : '';
                              const conds = prev.definition.filters.conditions.filter(c => c.path !== dateCol || c.operator !== 'range');
                              return {
                                ...prev,
                                definition: {
                                  ...prev.definition,
                                  filters: {
                                    ...prev.definition.filters,
                                    conditions: [...conds, { path: dateCol, operator: 'range', value: [start, endVal] }]
                                  }
                                }
                              };
                            });
                          }}
                          className="w-full text-[10px] px-1.5 py-0.5 rounded border border-outline-variant bg-surface-container"
                        />
                      </div>
                      <div>
                        <span className="text-[9px] font-medium text-on-surface-variant block">To Date</span>
                        <input
                          type="date"
                          onChange={e => {
                            const end = e.target.value;
                            if (!end) return;
                            const dateCol = reportDef.definition.columns.find(c => c.path.toLowerCase().includes('date') || c.path.toLowerCase().includes('created') || c.path.toLowerCase().includes('work') || c.path.toLowerCase().includes('expense'))?.path || 'created_date';
                            setReportDef(prev => {
                              const existing = prev.definition.filters.conditions.find(c => c.path === dateCol && c.operator === 'range');
                              const startVal = existing && Array.isArray(existing.value) ? existing.value[0] || '' : '';
                              const conds = prev.definition.filters.conditions.filter(c => c.path !== dateCol || c.operator !== 'range');
                              return {
                                ...prev,
                                definition: {
                                  ...prev.definition,
                                  filters: {
                                    ...prev.definition.filters,
                                    conditions: [...conds, { path: dateCol, operator: 'range', value: [startVal, end] }]
                                  }
                                }
                              };
                            });
                          }}
                          className="w-full text-[10px] px-1.5 py-0.5 rounded border border-outline-variant bg-surface-container"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider">
                      Report Filter Conditions ({reportDef.definition.filters.conditions.length})
                    </span>
                    <button
                      onClick={addFilter}
                      className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add Condition
                    </button>
                  </div>

                  {reportDef.definition.filters.conditions.length === 0 ? (
                    <p className="text-xs text-on-surface-variant/70 italic py-4 text-center">
                      No filters applied. Report will return all permitted records.
                    </p>
                  ) : (
                    reportDef.definition.filters.conditions.map((cond, idx) => {
                      const isDateField = cond.path && (cond.path.toLowerCase().includes('date') || cond.path.toLowerCase().includes('time') || cond.path.toLowerCase().includes('created') || cond.path.toLowerCase().includes('updated') || cond.path.toLowerCase().includes('at') || cond.path.toLowerCase().includes('on'));
                      return (
                        <div
                          key={idx}
                          draggable
                          onDragStart={() => setDraggedFilterIndex(idx)}
                          onDragOver={e => {
                            e.preventDefault();
                            setDragOverFilterIndex(idx);
                          }}
                          onDrop={e => {
                            e.preventDefault();
                            handleFilterDrop(idx);
                          }}
                          onDragEnd={() => {
                            setDraggedFilterIndex(null);
                            setDragOverFilterIndex(null);
                          }}
                          className={`p-2 rounded border transition-all space-y-1.5 text-xs ${draggedFilterIndex === idx
                            ? 'opacity-40 border-dashed border-primary bg-primary/5'
                            : dragOverFilterIndex === idx
                              ? 'border-primary ring-2 ring-primary/20 bg-surface'
                              : 'border-outline-variant bg-surface hover:border-primary/40'
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <GripVertical className="w-3.5 h-3.5 text-on-surface-variant/50 shrink-0 cursor-grab active:cursor-grabbing" />
                              <span className="text-[10px] font-semibold text-on-surface-variant">Condition #{idx + 1}</span>
                              {isDateField && (
                                <span className="text-[9px] font-semibold px-1.5 py-0.2 bg-primary/10 text-primary rounded flex items-center gap-0.5">
                                  <Calendar className="w-2.5 h-2.5" /> Date Field
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={() => moveFilter(idx, -1)}
                                disabled={idx === 0}
                                className="text-on-surface-variant hover:text-primary disabled:opacity-20 p-0.5"
                                title="Move Up"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => moveFilter(idx, 1)}
                                disabled={idx === reportDef.definition.filters.conditions.length - 1}
                                className="text-on-surface-variant hover:text-primary disabled:opacity-20 p-0.5"
                                title="Move Down"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => removeFilter(idx)} className="text-red-500 hover:text-red-700 p-0.5 ml-1" title="Remove Condition">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <select
                            value={cond.path}
                            onChange={e => updateFilter(idx, 'path', e.target.value)}
                            className="w-full text-[11px] px-1.5 py-1 rounded border border-outline-variant bg-surface-container"
                          >
                            {reportDef.definition.columns.map(c => (
                              <option key={c.path} value={c.path}>{c.label} ({c.path})</option>
                            ))}
                          </select>

                          <div className="space-y-1.5">
                            <select
                              value={cond.operator}
                              onChange={e => updateFilter(idx, 'operator', e.target.value)}
                              className="w-full text-[11px] px-1.5 py-1 rounded border border-outline-variant bg-surface-container"
                            >
                              {isDateField ? (
                                <>
                                  <option value="range">Date Range (From - To)</option>
                                  <option value="gte">From Date (On or After)</option>
                                  <option value="lte">To Date (On or Before)</option>
                                  <option value="equals">Exact Date (=)</option>
                                  <option value="this_month">This Month</option>
                                  <option value="last_month">Last Month</option>
                                  <option value="this_year">This Year</option>
                                  <option value="last_year">Last Year</option>
                                  <option value="is_null">Is Null / Empty</option>
                                  <option value="is_not_null">Is Not Null</option>
                                </>
                              ) : (
                                <>
                                  <option value="equals">Equals</option>
                                  <option value="not_equals">Not Equals</option>
                                  <option value="contains">Contains</option>
                                  <option value="gte">Greater or Equal</option>
                                  <option value="lte">Less or Equal</option>
                                  <option value="is_null">Is Null</option>
                                  <option value="is_not_null">Is Not Null</option>
                                </>
                              )}
                            </select>

                            {cond.operator === 'range' ? (
                              <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                  <span className="text-[9px] text-on-surface-variant block">From Date</span>
                                  <input
                                    type="date"
                                    value={Array.isArray(cond.value) ? cond.value[0] || '' : (typeof cond.value === 'string' && cond.value.includes(',') ? cond.value.split(',')[0] : cond.value || '')}
                                    onChange={e => {
                                      const start = e.target.value;
                                      const end = Array.isArray(cond.value) ? cond.value[1] || '' : (typeof cond.value === 'string' && cond.value.includes(',') ? cond.value.split(',')[1] : '');
                                      updateFilter(idx, 'value', [start, end]);
                                    }}
                                    className="w-full text-[10px] px-1.5 py-0.5 rounded border border-outline-variant bg-surface-container"
                                  />
                                </div>
                                <div>
                                  <span className="text-[9px] text-on-surface-variant block">To Date</span>
                                  <input
                                    type="date"
                                    value={Array.isArray(cond.value) ? cond.value[1] || '' : (typeof cond.value === 'string' && cond.value.includes(',') ? cond.value.split(',')[1] : '')}
                                    onChange={e => {
                                      const end = e.target.value;
                                      const start = Array.isArray(cond.value) ? cond.value[0] || '' : (typeof cond.value === 'string' && cond.value.includes(',') ? cond.value.split(',')[0] : '');
                                      updateFilter(idx, 'value', [start, end]);
                                    }}
                                    className="w-full text-[10px] px-1.5 py-0.5 rounded border border-outline-variant bg-surface-container"
                                  />
                                </div>
                              </div>
                            ) : isDateField && ['gte', 'lte', 'equals'].includes(cond.operator) ? (
                              <input
                                type="date"
                                value={cond.value || ''}
                                onChange={e => updateFilter(idx, 'value', e.target.value)}
                                className="w-full text-[11px] px-1.5 py-1 rounded border border-outline-variant bg-surface-container"
                              />
                            ) : ['this_month', 'last_month', 'this_year', 'last_year', 'is_null', 'is_not_null'].includes(cond.operator) ? null : (
                              <input
                                type="text"
                                placeholder="Value"
                                value={cond.value || ''}
                                onChange={e => updateFilter(idx, 'value', e.target.value)}
                                className="w-full text-[11px] px-1.5 py-1 rounded border border-outline-variant bg-surface-container"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* SORT & GROUP TAB */}
              {activeTab === 'grouping' && (
                <div className="space-y-4">
                  {/* SORT ORDER SECTION */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                        <ArrowUpDown className="w-3.5 h-3.5 text-primary" />
                        <span>Sort Order</span>
                      </div>
                      <button onClick={addSort} className="text-xs text-primary font-medium hover:underline flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add Sort Field
                      </button>
                    </div>

                    {reportDef.definition.sorting.length === 0 ? (
                      <p className="text-xs text-on-surface-variant/70 italic p-2.5 rounded border border-dashed border-outline-variant bg-surface-container/50 text-center">
                        No sort fields specified. Standard database ordering applied.
                      </p>
                    ) : (
                      reportDef.definition.sorting.map((sort, idx) => (
                        <div key={idx} className="flex items-center gap-2 mb-1.5 text-xs">
                          <select
                            value={sort.path}
                            onChange={e => {
                              const val = e.target.value;
                              setReportDef(prev => {
                                const s = [...prev.definition.sorting];
                                s[idx] = { ...s[idx], path: val };
                                return { ...prev, definition: { ...prev.definition, sorting: s } };
                              });
                            }}
                            className="flex-1 text-[11px] px-1.5 py-1 rounded border border-outline-variant bg-surface-container"
                          >
                            {reportDef.definition.columns.map(c => (
                              <option key={c.path} value={c.path}>{c.label}</option>
                            ))}
                          </select>

                          <select
                            value={sort.direction}
                            onChange={e => {
                              const val = e.target.value as any;
                              setReportDef(prev => {
                                const s = [...prev.definition.sorting];
                                s[idx] = { ...s[idx], direction: val };
                                return { ...prev, definition: { ...prev.definition, sorting: s } };
                              });
                            }}
                            className="text-[11px] px-1.5 py-1 rounded border border-outline-variant bg-surface-container"
                          >
                            <option value="asc">ASC (A-Z)</option>
                            <option value="desc">DESC (Z-A)</option>
                          </select>

                          <button onClick={() => removeSort(idx)} className="text-red-500 hover:text-red-700 p-0.5">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* GROUP BY SECTION */}
                  <div className="pt-3 border-t border-outline-variant space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                        <Layers className="w-3.5 h-3.5 text-primary" />
                        <span>Group Rows By Field</span>
                      </div>
                      <button
                        onClick={() => {
                          setReportDef(prev => {
                            const fields = prev.definition.grouping?.fields || [];
                            const available = prev.definition.columns.find(c => !fields.includes(c.path));
                            if (!available) return prev;
                            return {
                              ...prev,
                              definition: {
                                ...prev.definition,
                                grouping: {
                                  fields: [...fields, available.path],
                                  aggregations: prev.definition.grouping?.aggregations || [],
                                },
                              },
                            };
                          });
                        }}
                        className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Group Field
                      </button>
                    </div>

                    {!reportDef.definition.grouping?.fields || reportDef.definition.grouping.fields.length === 0 ? (
                      <p className="text-xs text-on-surface-variant/70 italic p-3 rounded border border-dashed border-outline-variant bg-surface-container/50 text-center">
                        No grouping applied. Report will display raw detail rows.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {reportDef.definition.grouping.fields.map((fieldPath, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs p-2 rounded border border-outline-variant bg-surface">
                            <span className="text-[10px] font-bold text-primary px-1.5 py-0.5 rounded bg-primary/10">
                              Group #{idx + 1}
                            </span>
                            <select
                              value={fieldPath}
                              onChange={e => {
                                const val = e.target.value;
                                setReportDef(prev => {
                                  const fields = [...(prev.definition.grouping?.fields || [])];
                                  fields[idx] = val;
                                  return {
                                    ...prev,
                                    definition: {
                                      ...prev.definition,
                                      grouping: {
                                        fields,
                                        aggregations: prev.definition.grouping?.aggregations || [],
                                      },
                                    },
                                  };
                                });
                              }}
                              className="flex-1 text-[11px] px-2 py-1 rounded border border-outline-variant bg-surface-container"
                            >
                              {reportDef.definition.columns.map(c => (
                                <option key={c.path} value={c.path}>{c.label} ({c.path})</option>
                              ))}
                            </select>
                            <button
                              onClick={() => {
                                setReportDef(prev => {
                                  const fields = (prev.definition.grouping?.fields || []).filter((_, i) => i !== idx);
                                  return {
                                    ...prev,
                                    definition: {
                                      ...prev.definition,
                                      grouping: {
                                        fields,
                                        aggregations: prev.definition.grouping?.aggregations || [],
                                      },
                                    },
                                  };
                                });
                              }}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="Remove Group Field"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* GROUP AGGREGATIONS SECTION */}
                  {reportDef.definition.grouping?.fields && reportDef.definition.grouping.fields.length > 0 && (
                    <div className="pt-3 border-t border-outline-variant space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                          <Grid className="w-3.5 h-3.5 text-primary" />
                          <span>Group Summary Metrics</span>
                        </div>
                        <button
                          onClick={() => {
                            setReportDef(prev => {
                              const aggs = prev.definition.grouping?.aggregations || [];
                              const firstCol = prev.definition.columns[0]?.path || '';
                              return {
                                ...prev,
                                definition: {
                                  ...prev.definition,
                                  grouping: {
                                    fields: prev.definition.grouping?.fields || [],
                                    aggregations: [
                                      ...aggs,
                                      { path: firstCol, function: 'count', label: `COUNT of ${firstCol}` },
                                    ],
                                  },
                                },
                              };
                            });
                          }}
                          className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add Metric
                        </button>
                      </div>

                      {(!reportDef.definition.grouping.aggregations || reportDef.definition.grouping.aggregations.length === 0) ? (
                        <p className="text-xs text-on-surface-variant/70 italic p-2.5 rounded border border-dashed border-outline-variant bg-surface-container/50 text-center">
                          No summary metrics configured. Add COUNT, SUM, or AVG for group totals.
                        </p>
                      ) : (
                        reportDef.definition.grouping.aggregations.map((agg, idx) => (
                          <div key={idx} className="p-2 rounded border border-outline-variant bg-surface space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold text-on-surface-variant">Summary Metric #{idx + 1}</span>
                              <button
                                onClick={() => {
                                  setReportDef(prev => {
                                    const aggs = (prev.definition.grouping?.aggregations || []).filter((_, i) => i !== idx);
                                    return {
                                      ...prev,
                                      definition: {
                                        ...prev.definition,
                                        grouping: {
                                          fields: prev.definition.grouping?.fields || [],
                                          aggregations: aggs,
                                        },
                                      },
                                    };
                                  });
                                }}
                                className="text-red-500 hover:text-red-700 p-0.5"
                                title="Remove Metric"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-1.5">
                              <select
                                value={agg.function}
                                onChange={e => {
                                  const fn = e.target.value as any;
                                  setReportDef(prev => {
                                    const aggs = [...(prev.definition.grouping?.aggregations || [])];
                                    aggs[idx] = { ...aggs[idx], function: fn };
                                    return {
                                      ...prev,
                                      definition: {
                                        ...prev.definition,
                                        grouping: { fields: prev.definition.grouping?.fields || [], aggregations: aggs },
                                      },
                                    };
                                  });
                                }}
                                className="text-[11px] px-1.5 py-1 rounded border border-outline-variant bg-surface-container font-semibold"
                              >
                                <option value="count">COUNT</option>
                                <option value="sum">SUM</option>
                                <option value="avg">AVERAGE</option>
                                <option value="min">MIN</option>
                                <option value="max">MAX</option>
                              </select>

                              <select
                                value={agg.path}
                                onChange={e => {
                                  const path = e.target.value;
                                  setReportDef(prev => {
                                    const aggs = [...(prev.definition.grouping?.aggregations || [])];
                                    aggs[idx] = { ...aggs[idx], path };
                                    return {
                                      ...prev,
                                      definition: {
                                        ...prev.definition,
                                        grouping: { fields: prev.definition.grouping?.fields || [], aggregations: aggs },
                                      },
                                    };
                                  });
                                }}
                                className="text-[11px] px-1.5 py-1 rounded border border-outline-variant bg-surface-container"
                              >
                                {reportDef.definition.columns.map(c => (
                                  <option key={c.path} value={c.path}>{c.label}</option>
                                ))}
                              </select>
                            </div>

                            <input
                              type="text"
                              placeholder="Metric Header Label"
                              value={agg.label}
                              onChange={e => {
                                const label = e.target.value;
                                setReportDef(prev => {
                                  const aggs = [...(prev.definition.grouping?.aggregations || [])];
                                  aggs[idx] = { ...aggs[idx], label };
                                  return {
                                    ...prev,
                                    definition: {
                                      ...prev.definition,
                                      grouping: { fields: prev.definition.grouping?.fields || [], aggregations: aggs },
                                    },
                                  };
                                });
                              }}
                              className="w-full text-[11px] px-1.5 py-1 rounded border border-outline-variant bg-surface-container"
                            />
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* Period Comparison Card inside Filters Tab */}
                  <div className="pt-3 border-t border-outline-variant space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-on-surface">
                        <Calendar className="w-3.5 h-3.5 text-primary" />
                        <span>Period Comparison Mode</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={reportDef.definition.comparison?.enabled || false}
                        onChange={e => {
                          const checked = e.target.checked;
                          const today = new Date().toISOString().split('T')[0];
                          setReportDef(prev => ({
                            ...prev,
                            definition: {
                              ...prev.definition,
                              comparison: {
                                enabled: checked,
                                type: prev.definition.comparison?.type || 'previous_month',
                                date_field: prev.definition.comparison?.date_field || reportDef.definition.columns[0]?.path || 'created_date',
                                custom_period_a: prev.definition.comparison?.custom_period_a || [today, today],
                                custom_period_b: prev.definition.comparison?.custom_period_b || [today, today],
                              },
                            },
                          }));
                        }}
                        className="rounded border-outline-variant text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                      />
                    </div>

                    {reportDef.definition.comparison?.enabled && (
                      <div className="p-3 rounded border border-primary/30 bg-primary/5 space-y-3 text-xs">
                        <div>
                          <label className="text-[10px] font-semibold text-on-surface-variant block mb-1">
                            Comparison Preset
                          </label>
                          <select
                            value={reportDef.definition.comparison?.type || 'previous_month'}
                            onChange={e => {
                              const val = e.target.value as any;
                              const today = new Date().toISOString().split('T')[0];
                              setReportDef(prev => ({
                                ...prev,
                                definition: {
                                  ...prev.definition,
                                  comparison: {
                                    ...prev.definition.comparison!,
                                    type: val,
                                    custom_period_a: prev.definition.comparison?.custom_period_a || [today, today],
                                    custom_period_b: prev.definition.comparison?.custom_period_b || [today, today],
                                  },
                                },
                              }));
                            }}
                            className="w-full text-[11px] px-2.5 py-1.5 rounded border border-outline-variant bg-surface"
                          >
                            <option value="previous_month">Current Month vs Previous Month</option>
                            <option value="previous_year">Current Year vs Previous Year</option>
                            <option value="custom">Custom Date Ranges</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-semibold text-on-surface-variant block mb-1">
                            Date Column to Compare
                          </label>
                          <select
                            value={reportDef.definition.comparison?.date_field || 'created_date'}
                            onChange={e => {
                              const val = e.target.value;
                              setReportDef(prev => ({
                                ...prev,
                                definition: {
                                  ...prev.definition,
                                  comparison: { ...prev.definition.comparison!, date_field: val },
                                },
                              }));
                            }}
                            className="w-full text-[11px] px-2.5 py-1.5 rounded border border-outline-variant bg-surface"
                          >
                            {reportDef.definition.columns.map(c => (
                              <option key={c.path} value={c.path}>{c.label} ({c.path})</option>
                            ))}
                          </select>
                        </div>

                        {reportDef.definition.comparison?.type === 'custom' && (
                          <div className="space-y-2.5 pt-2 border-t border-outline-variant/60">
                            <div>
                              <label className="text-[10px] font-bold text-primary block mb-1">
                                Period A (Current Range)
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="text-[9px] text-on-surface-variant block">From Date</span>
                                  <input
                                    type="date"
                                    value={reportDef.definition.comparison?.custom_period_a?.[0] || ''}
                                    onChange={e => {
                                      const start = e.target.value;
                                      setReportDef(prev => ({
                                        ...prev,
                                        definition: {
                                          ...prev.definition,
                                          comparison: {
                                            ...prev.definition.comparison!,
                                            custom_period_a: [start, prev.definition.comparison?.custom_period_a?.[1] || ''],
                                          },
                                        },
                                      }));
                                    }}
                                    className="w-full text-[11px] px-2 py-1 rounded border border-outline-variant bg-surface"
                                  />
                                </div>
                                <div>
                                  <span className="text-[9px] text-on-surface-variant block">To Date</span>
                                  <input
                                    type="date"
                                    value={reportDef.definition.comparison?.custom_period_a?.[1] || ''}
                                    onChange={e => {
                                      const end = e.target.value;
                                      setReportDef(prev => ({
                                        ...prev,
                                        definition: {
                                          ...prev.definition,
                                          comparison: {
                                            ...prev.definition.comparison!,
                                            custom_period_a: [prev.definition.comparison?.custom_period_a?.[0] || '', end],
                                          },
                                        },
                                      }));
                                    }}
                                    className="w-full text-[11px] px-2 py-1 rounded border border-outline-variant bg-surface"
                                  />
                                </div>
                              </div>
                            </div>

                            <div>
                              <label className="text-[10px] font-bold text-secondary block mb-1">
                                Period B (Comparison Base Range)
                              </label>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="text-[9px] text-on-surface-variant block">From Date</span>
                                  <input
                                    type="date"
                                    value={reportDef.definition.comparison?.custom_period_b?.[0] || ''}
                                    onChange={e => {
                                      const start = e.target.value;
                                      setReportDef(prev => ({
                                        ...prev,
                                        definition: {
                                          ...prev.definition,
                                          comparison: {
                                            ...prev.definition.comparison!,
                                            custom_period_b: [start, prev.definition.comparison?.custom_period_b?.[1] || ''],
                                          },
                                        },
                                      }));
                                    }}
                                    className="w-full text-[11px] px-2 py-1 rounded border border-outline-variant bg-surface"
                                  />
                                </div>
                                <div>
                                  <span className="text-[9px] text-on-surface-variant block">To Date</span>
                                  <input
                                    type="date"
                                    value={reportDef.definition.comparison?.custom_period_b?.[1] || ''}
                                    onChange={e => {
                                      const end = e.target.value;
                                      setReportDef(prev => ({
                                        ...prev,
                                        definition: {
                                          ...prev.definition,
                                          comparison: {
                                            ...prev.definition.comparison!,
                                            custom_period_b: [prev.definition.comparison?.custom_period_b?.[0] || '', end],
                                          },
                                        },
                                      }));
                                    }}
                                    className="w-full text-[11px] px-2 py-1 rounded border border-outline-variant bg-surface"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* LAYOUT / THEME TAB */}
              {activeTab === 'layout' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider block mb-1.5">
                      Visual Theme
                    </label>
                    <div className="space-y-1.5">
                      {DEFAULT_THEMES.map(theme => (
                        <div
                          key={theme.key}
                          onClick={() => setReportDef(prev => ({ ...prev, theme: theme.key }))}
                          className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-colors text-xs ${reportDef.theme === theme.key ? 'border-primary bg-primary/10 font-semibold' : 'border-outline-variant bg-surface hover:bg-surface-container'
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-3.5 h-3.5 rounded-full ${theme.color}`} />
                            <span>{theme.label}</span>
                          </div>
                          {reportDef.theme === theme.key && <Check className="w-4 h-4 text-primary" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider block mb-1">
                        Page Orientation
                      </label>
                      <select
                        value={reportDef.page_orientation}
                        onChange={e => setReportDef(prev => ({ ...prev, page_orientation: e.target.value as any }))}
                        className="w-full text-xs px-2 py-1.5 rounded border border-outline-variant bg-surface-container"
                      >
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider block mb-1">
                        Paper Size
                      </label>
                      <select
                        value={reportDef.page_size}
                        onChange={e => setReportDef(prev => ({ ...prev, page_size: e.target.value as any }))}
                        className="w-full text-xs px-2 py-1.5 rounded border border-outline-variant bg-surface-container"
                      >
                        <option value="A4">A4</option>
                        <option value="A3">A3</option>
                        <option value="Letter">Letter</option>
                      </select>
                    </div>
                  </div>

                  {/* Dynamic Formatting Controls */}
                  <div className="space-y-3 pt-3 border-t border-outline-variant">
                    <span className="text-[10px] text-on-surface-variant font-medium uppercase tracking-wider block">
                      Output Controls & Security
                    </span>

                    <div>
                      <label className="text-[10px] text-on-surface-variant block mb-1">Watermark Text</label>
                      <input
                        type="text"
                        placeholder="e.g. CONFIDENTIAL, DRAFT"
                        value={reportDef.definition.watermark_text || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setReportDef(prev => ({
                            ...prev,
                            definition: { ...prev.definition, watermark_text: val }
                          }));
                        }}
                        className="w-full text-xs px-2 py-1.5 rounded border border-outline-variant bg-surface-container"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-xs text-on-surface font-medium">Embed QR Verification Code</label>
                      <input
                        type="checkbox"
                        checked={reportDef.definition.enable_qr !== false}
                        onChange={e => {
                          const checked = e.target.checked;
                          setReportDef(prev => ({
                            ...prev,
                            definition: { ...prev.definition, enable_qr: checked }
                          }));
                        }}
                        className="rounded border-outline-variant text-primary focus:ring-primary"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="text-xs text-on-surface font-medium">Add Approval Signature Lines</label>
                      <input
                        type="checkbox"
                        checked={Boolean(reportDef.definition.enable_signatures)}
                        onChange={e => {
                          const checked = e.target.checked;
                          setReportDef(prev => ({
                            ...prev,
                            definition: { ...prev.definition, enable_signatures: checked }
                          }));
                        }}
                        className="rounded border-outline-variant text-primary focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Live Preview & Export Bar */}
          <div className={`flex-1 ${mobileTab === 'preview' ? 'flex' : 'hidden lg:flex'} flex-col overflow-hidden bg-surface-container min-w-0`}>
            {/* Export Toolbar */}
            <div className="px-4 py-2 border-b border-outline-variant bg-surface-container-low flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 text-xs font-semibold text-on-surface">
                <Eye className="w-4 h-4 text-primary" />
                <span>Live Data Preview</span>
                {previewResult && (
                  <span className="text-[10px]  bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                    {previewResult.row_count} rows ({previewResult.duration_ms}ms)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => triggerExport('pdf')}
                  disabled={!previewResult || exportingFormat === 'pdf'}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  <Download className="w-3 h-3" /> PDF
                </button>
                <button
                  onClick={() => triggerExport('excel')}
                  disabled={!previewResult || exportingFormat === 'excel'}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-3 h-3" /> Excel
                </button>
                <button
                  onClick={() => triggerExport('csv')}
                  disabled={!previewResult || exportingFormat === 'csv'}
                  className="flex items-center gap-1 px-2.5 py-1 rounded border border-outline-variant text-xs font-medium hover:bg-surface-container-high transition-colors disabled:opacity-50"
                >
                  <FileCode className="w-3 h-3" /> CSV
                </button>
              </div>
            </div>

            {/* Live Period & Date Comparison Selector Bar */}
            <div className="px-4 py-2 border-b border-outline-variant/60 bg-surface-container-low/70 space-y-2 text-xs shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-on-surface-variant flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-primary" /> Date & Period Comparison:
                  </span>
                  <select
                    value={reportDef.definition.comparison?.enabled ? reportDef.definition.comparison.type : 'off'}
                    onChange={e => {
                      const val = e.target.value;
                      const enabled = val !== 'off';
                      const today = new Date().toISOString().split('T')[0];
                      setReportDef(prev => ({
                        ...prev,
                        definition: {
                          ...prev.definition,
                          comparison: {
                            enabled,
                            type: enabled ? (val as any) : (prev.definition.comparison?.type || 'previous_month'),
                            date_field: prev.definition.comparison?.date_field || reportDef.definition.columns[0]?.path || 'created_date',
                            custom_period_a: prev.definition.comparison?.custom_period_a || [today, today],
                            custom_period_b: prev.definition.comparison?.custom_period_b || [today, today],
                          }
                        }
                      }));
                    }}
                    className="text-[11px] px-2 py-1 rounded border border-outline-variant bg-surface text-on-surface font-semibold focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="off">Disabled (Standard Detail Table)</option>
                    <option value="previous_month">Current Month vs Previous Month</option>
                    <option value="previous_year">Current Year vs Previous Year</option>
                    <option value="custom">Custom Date Ranges (Period A vs B)</option>
                  </select>
                </div>

                {reportDef.definition.comparison?.enabled ? (
                  <div className="flex items-center gap-1.5 bg-primary/10 text-primary font-bold text-[10px] px-2.5 py-1 rounded-full border border-primary/30">
                    <Check className="w-3 h-3 text-primary" />
                    <span>Dynamic Side-by-Side Comparison Active</span>
                  </div>
                ) : (
                  <span className="text-[10px] text-on-surface-variant/70 italic">
                    Select a comparison preset to view dynamic date/store side-by-side columns
                  </span>
                )}
              </div>

              {/* Inline Custom Date Pickers when Custom mode is selected */}
              {reportDef.definition.comparison?.enabled && reportDef.definition.comparison.type === 'custom' && (
                <div className="p-2.5 rounded border border-primary/30 bg-surface/90 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-primary block mb-1">
                      Period A Range (Current Period)
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <span className="text-[9px] text-on-surface-variant block font-medium">From Date</span>
                        <input
                          type="date"
                          value={reportDef.definition.comparison.custom_period_a?.[0] || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setReportDef(prev => ({
                              ...prev,
                              definition: {
                                ...prev.definition,
                                comparison: {
                                  ...prev.definition.comparison!,
                                  custom_period_a: [val, prev.definition.comparison?.custom_period_a?.[1] || '']
                                }
                              }
                            }));
                          }}
                          className="w-full text-[10px] px-1.5 py-1 rounded border border-outline-variant bg-surface "
                        />
                      </div>
                      <div>
                        <span className="text-[9px] text-on-surface-variant block font-medium">To Date</span>
                        <input
                          type="date"
                          value={reportDef.definition.comparison.custom_period_a?.[1] || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setReportDef(prev => ({
                              ...prev,
                              definition: {
                                ...prev.definition,
                                comparison: {
                                  ...prev.definition.comparison!,
                                  custom_period_a: [prev.definition.comparison?.custom_period_a?.[0] || '', val]
                                }
                              }
                            }));
                          }}
                          className="w-full text-[10px] px-1.5 py-1 rounded border border-outline-variant bg-surface "
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-on-surface block mb-1">
                      Period B Range (Compare Base Period)
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <span className="text-[9px] text-on-surface-variant block font-medium">From Date</span>
                        <input
                          type="date"
                          value={reportDef.definition.comparison.custom_period_b?.[0] || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setReportDef(prev => ({
                              ...prev,
                              definition: {
                                ...prev.definition,
                                comparison: {
                                  ...prev.definition.comparison!,
                                  custom_period_b: [val, prev.definition.comparison?.custom_period_b?.[1] || '']
                                }
                              }
                            }));
                          }}
                          className="w-full text-[10px] px-1.5 py-1 rounded border border-outline-variant bg-surface "
                        />
                      </div>
                      <div>
                        <span className="text-[9px] text-on-surface-variant block font-medium">To Date</span>
                        <input
                          type="date"
                          value={reportDef.definition.comparison.custom_period_b?.[1] || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setReportDef(prev => ({
                              ...prev,
                              definition: {
                                ...prev.definition,
                                comparison: {
                                  ...prev.definition.comparison!,
                                  custom_period_b: [prev.definition.comparison?.custom_period_b?.[0] || '', val]
                                }
                              }
                            }));
                          }}
                          className="w-full text-[10px] px-1.5 py-1 rounded border border-outline-variant bg-surface "
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Preview Output */}
            <div className="flex-1 overflow-auto p-4 scrollbar-thin">
              {previewLoading ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-on-surface-variant">
                  <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-xs font-medium">Executing query engine...</span>
                </div>
              ) : previewError ? (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 text-xs">
                  <strong>Query Error:</strong> {previewError}
                </div>
              ) : !previewResult ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-on-surface-variant/60">
                  <SlidersHorizontal className="w-12 h-12 stroke-[1.5]" />
                  <p className="text-xs font-medium">Configure columns and click "Run Preview" to test your report.</p>
                </div>
              ) : previewResult.rows.length === 0 ? (
                <div className="text-center py-12 text-on-surface-variant text-xs">
                  Query returned 0 rows matching your conditions.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* KPI Cards Preview */}
                  {previewResult.kpi_cards && previewResult.kpi_cards.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {previewResult.kpi_cards.map((card: any, idx: number) => (
                        <div key={idx} className="p-3 rounded-lg border border-outline-variant bg-surface shadow-sm">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                            {card.label}
                          </div>
                          <div className="text-xl font-bold text-primary mt-1 flex items-baseline justify-between">
                            <span>{typeof card.value === 'number' ? card.value.toLocaleString() : card.value}</span>
                            {card.is_comparison && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${card.is_positive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'
                                }`}>
                                {card.is_positive ? '▲ +' : '▼ '}
                                {card.delta_pct}%
                              </span>
                            )}
                          </div>
                          {card.is_comparison && (
                            <div className="text-[10px] text-on-surface-variant/80 mt-1 truncate" title={`vs ${card.label_b}: ${card.previous_value}`}>
                              vs {card.label_b}: <span className="font-semibold">{card.previous_value?.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Chart Images Preview */}
                  {previewResult.charts && previewResult.charts.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {previewResult.charts.map((chart: any, idx: number) => (
                        <div key={idx} className="p-3 rounded-lg border border-outline-variant bg-surface shadow-sm text-center">
                          <h4 className="text-xs font-semibold text-on-surface mb-2">{chart.title}</h4>
                          <img src={chart.image} alt={chart.title} className="max-w-full h-auto mx-auto rounded" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Data Table */}
                  <div className="bg-surface rounded-lg border border-outline-variant shadow-sm overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse table-fixed">
                      <thead>
                        <tr className="bg-surface-container-high border-b border-outline-variant font-semibold text-on-surface text-[11px]">
                          {((previewResult.is_grouped && previewResult.columns?.length) ? previewResult.columns : reportDef.definition.columns).map((col: any) => (
                            <th key={col.path} className={`p-2.5 text-${col.alignment || 'left'} break-words`}>
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/40">
                        {previewResult.rows.map((row: any, rIdx: number) => (
                          <tr key={rIdx} className="hover:bg-surface-container-low transition-colors">
                            {((previewResult.is_grouped && previewResult.columns?.length) ? previewResult.columns : reportDef.definition.columns).map((col: any) => (
                              <td key={col.path} className={`p-2.5 text-${col.alignment || 'left'} break-words`}>
                                {row[col.path] !== null && row[col.path] !== undefined ? String(row[col.path]) : ''}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsView;
