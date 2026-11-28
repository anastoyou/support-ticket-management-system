import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck, Clock, CheckCircle2, User, Filter, Layers, Receipt, Building2,
  DollarSign, Loader2, ChevronDown, ChevronRight, Ticket, ExternalLink,
  Check, X, RotateCcw, MessageSquare, Paperclip, FileText, File, Headphones, Video, Image as ImageIcon, Eye,
  FolderKanban
} from 'lucide-react';
import type { ApprovalInstanceItem, ApprovalStepInfo, LedgerGroupItem } from './types';
import { Pagination } from './Pagination';
import { SearchableSelect, type SelectOption } from '../../components/SearchableSelect';
import { MediaPreviewModal, getMediaUrl, isImage, isAudio, isVideo, type Media } from '../ticket/TicketsTypesAndComponents';
import Can from '../../hooks/Can';

export interface ApprovalsSubpageProps {
  approvals?: ApprovalInstanceItem[];
  roleFilteredApprovals: ApprovalInstanceItem[];
  displayedApprovals: ApprovalInstanceItem[];
  loading: boolean;
  submitting: boolean;
  roleFilterOnly: boolean;
  setRoleFilterOnly: (val: boolean) => void;
  currentUser: any;
  approvalEntityTab: 'ALL' | 'Bundle' | 'Ledger' | 'Expense';
  setApprovalEntityTab: (tab: 'ALL' | 'Bundle' | 'Ledger' | 'Expense') => void;
  approvalStatusTab: string;
  setApprovalStatusTab: (st: string) => void;
  expandedApprovalIds: Record<number, boolean>;
  toggleExpandApproval: (id: number) => void;
  renderStatusBadge: (status: string, isActionableForMe?: boolean, stepName?: string, hasCurrentUserApproved?: boolean) => React.ReactNode;
  setSelectedTicketForModal: (ticket: any) => void;
  setShowApprovalModal: (app: ApprovalInstanceItem | null) => void;
  setApprovalAction: (action: 'APPROVED' | 'REJECTED' | 'REWORK') => void;
  setApprovalComments: (c: string) => void;
  setPreviewMediaUrl: (media: { url: string; title: string } | null) => void;
  showApprovalModal: ApprovalInstanceItem | null;
  approvalAction: 'APPROVED' | 'REJECTED' | 'REWORK';
  approvalComments: string;
  handleActionApproval: (
    customAction?: 'APPROVED' | 'REJECTED' | 'REWORK',
    customComments?: string,
    customApp?: ApprovalInstanceItem,
    customLedgerGroupId?: number | string | null,
    customNewGroupName?: string
  ) => Promise<void> | void;
  fixedEntityType?: 'Bundle' | 'Ledger' | 'Expense';
  ledgerGroups?: LedgerGroupItem[];
  token?: string | null;
  API_URL?: string;
}

export const ApprovalsSubpage: React.FC<ApprovalsSubpageProps> = ({
  roleFilteredApprovals,
  displayedApprovals,
  loading,
  submitting,
  roleFilterOnly,
  setRoleFilterOnly,
  currentUser,
  approvalEntityTab,
  setApprovalEntityTab,
  approvalStatusTab,
  setApprovalStatusTab,
  expandedApprovalIds,
  toggleExpandApproval,
  renderStatusBadge,
  setSelectedTicketForModal,
  setShowApprovalModal,
  setApprovalAction,
  setApprovalComments,
  setPreviewMediaUrl,
  showApprovalModal,
  approvalAction,
  approvalComments,
  handleActionApproval,
  fixedEntityType,
  ledgerGroups = [],
  token,
  API_URL
}) => {
  const getCleanRemarks = (raw?: string) => {
    if (!raw) return '';
    const lines = raw.split('\n');
    const cleanLines = lines.filter(line => !line.trim().match(/^\[.+?\]:/));
    return cleanLines.join('\n').trim();
  };
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Group reassignment state when Reworking a Ledger
  const [reworkGroupMode, setReworkGroupMode] = useState<'keep' | 'existing' | 'new'>('keep');
  const [reworkTargetGroupId, setReworkTargetGroupId] = useState<string>('');
  const [reworkNewGroupName, setReworkNewGroupName] = useState<string>('');
  const [reworkDynamicGroups, setReworkDynamicGroups] = useState<LedgerGroupItem[]>(ledgerGroups || []);
  const [loadingReworkGroups, setLoadingReworkGroups] = useState<boolean>(false);
  const reworkSearchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ledgerGroups && ledgerGroups.length > 0) {
      setReworkDynamicGroups(ledgerGroups);
    }
  }, [ledgerGroups]);

  const handleSearchReworkGroups = async (searchTerm: string) => {
    if (!API_URL) return;
    if (reworkSearchTimeoutRef.current) {
      clearTimeout(reworkSearchTimeoutRef.current);
    }

    setLoadingReworkGroups(true);
    reworkSearchTimeoutRef.current = setTimeout(async () => {
      try {
        const queryParam = searchTerm.trim() ? `&search=${encodeURIComponent(searchTerm.trim())}` : '';
        const res = await fetch(`${API_URL}/finance/ledger-groups/?page_size=10${queryParam}`, {
          headers: {
            'Authorization': `Token ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (res.ok) {
          const data = await res.json();
          const results: LedgerGroupItem[] = Array.isArray(data)
            ? data
            : (Array.isArray(data.results) ? data.results : []);
          setReworkDynamicGroups(results);
        }
      } catch (err) {
        console.error('Failed to search ledger groups for rework:', err);
      } finally {
        setLoadingReworkGroups(false);
      }
    }, 250);
  };

  useEffect(() => {
    if (showApprovalModal) {
      setReworkGroupMode('keep');
      setReworkTargetGroupId('');
      setReworkNewGroupName('');
      if (API_URL) {
        handleSearchReworkGroups('');
      }
    }
  }, [showApprovalModal]);

  const reworkGroupOptions: SelectOption[] = useMemo(() => {
    return reworkDynamicGroups.map((g) => ({
      value: String(g.ledger_group_id),
      label: g.group_name,
      sublabel: `Total: ${parseFloat(String(g.total_amount || 0)).toFixed(3)} KD`
    }));
  }, [reworkDynamicGroups]);

  // Lightbox Media Preview State
  const [mediaPreviewState, setMediaPreviewState] = useState<{ items: any[]; index: number } | null>(null);

  // Nested Bundle Accordion State for Ledger Batches
  const [expandedBundleIds, setExpandedBundleIds] = useState<Record<number, boolean>>({});
  const toggleExpandBundle = (id: number) => {
    setExpandedBundleIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Check administrator privileges (Only Administrator role or Django superuser is the main admin; all others are role-based)
  const isAdmin = useMemo(() => {
    if (!currentUser) return false;
    const roleName = (
      (currentUser?.role as any)?.role_name ||
      (typeof currentUser?.role === 'string' ? currentUser.role : '') ||
      currentUser?.role_name ||
      ''
    ).toLowerCase().trim();
    const isSuper = !!currentUser?.is_superuser;
    const isAdmRole = roleName === 'administrator';
    return isSuper || isAdmRole;
  }, [currentUser]);

  // Effective approvals filtering when embedded in entity subpage (Expenses, Bundles, Ledgers)
  const effectiveDisplayedApprovals = useMemo(() => {
    if (!fixedEntityType) return displayedApprovals;
    return displayedApprovals.filter(a => {
      const type = a.target_summary?.type || (a.claim ? 'Bundle' : (a.ledger ? 'Ledger' : 'Expense'));
      return type === fixedEntityType;
    });
  }, [displayedApprovals, fixedEntityType]);

  useEffect(() => {
    setCurrentPage(1);
  }, [effectiveDisplayedApprovals.length, approvalEntityTab, approvalStatusTab, roleFilterOnly]);

  const paginatedApprovals = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return effectiveDisplayedApprovals.slice(start, start + itemsPerPage);
  }, [effectiveDisplayedApprovals, currentPage, itemsPerPage]);

  // Render Visual Stepper Pipeline UI
  const renderApprovalStepper = (group: { label: string; type: 'Bundle' | 'Ledger' | 'Expense'; id: number; items: ApprovalInstanceItem[]; isApproved?: boolean }) => {
    let steps: ApprovalStepInfo[] = [];
    for (const item of group.items) {
      if (item.workflow_steps && item.workflow_steps.length > 0) {
        steps = item.workflow_steps;
        break;
      }
    }

    if (steps.length === 0 && roleFilteredApprovals) {
      const matchInAll = roleFilteredApprovals.find(a =>
        (a.workflow_steps && a.workflow_steps.length > 0) &&
        (a.target_summary?.type === group.type || (group.type === 'Expense' && (a.expense || a.expense_id)))
      );
      if (matchInAll?.workflow_steps) {
        steps = matchInAll.workflow_steps;
      }
    }

    if (steps.length === 0) {
      const stepNamesSeen = new Set<string>();
      group.items.forEach(i => {
        if (!stepNamesSeen.has(i.step_name)) {
          stepNamesSeen.add(i.step_name);
          steps.push({
            step_id: steps.length + 1,
            step_order: steps.length + 1,
            step_name: i.step_name,
            assigned_role_name: i.assigned_role_name || ''
          });
        }
      });
    }

    // Is the overall pipeline completely finished/approved?
    const isFinished = group.isApproved || (steps.length > 0 && group.items.some(i => i.status === 'Approved' && ((i as any).is_final_step || i.step_order === steps.length))) || (group.items.length > 0 && group.items.every(i => i.status === 'Approved'));

    // Find the current active step index if pending
    const activePendingItem = group.items.find(i => i.status === 'Pending');
    const activePendingOrder: number = (activePendingItem && typeof activePendingItem.step_order === 'number') ? activePendingItem.step_order : (isFinished ? steps.length + 1 : 1);

    return (
      <div className="p-4 bg-surface-container-low border-b border-outline-variant/60 overflow-x-auto">
        <div className="flex items-start justify-between min-w-[520px] lg:min-w-0 w-full px-2 py-2">
          {/* START NODE */}
          <div className="flex flex-col items-center shrink-0 w-16">
            <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-[10px] font-bold border border-emerald-500/40 shrink-0">
              Start
            </div>
            <span className="text-[10px] text-on-surface-variant mt-1 font-medium">Submitted</span>
          </div>

          {/* STEP NODES & CONNECTORS */}
          {steps.map((step, idx) => {
            const stepOrderNum = typeof step.step_order === 'number' ? step.step_order : (idx + 1);
            const stepInst = group.items.find(i => i.step_name === step.step_name || i.step_order === step.step_order);
            const isApproved = isFinished || (stepInst && stepInst.status === 'Approved') || (stepOrderNum < activePendingOrder && !stepInst);
            const isPending = !isFinished && ((stepInst && stepInst.status === 'Pending') || (!stepInst && stepOrderNum === activePendingOrder));
            const isRejected = stepInst && stepInst.status === 'Rejected';
            const isRework = stepInst && stepInst.status === 'Rework';
            const isUpcoming = !isApproved && !isPending && !isRejected && !isRework;

            let circleClass = "bg-surface-container-high text-on-surface-variant border-outline";
            let labelBadge = step.assigned_role_name;
            if (step.assigned_users_names && step.assigned_users_names.length > 0) {
              labelBadge = `${step.assigned_role_name ? step.assigned_role_name + ': ' : ''}${step.assigned_users_names.join(', ')}`;
            }
            let iconNode: React.ReactNode = step.step_order;

            const actionUserDisplay = stepInst?.action_by_full_name || stepInst?.action_by_username || (typeof (stepInst as any)?.action_by === 'object' ? ((stepInst as any).action_by?.full_name || (stepInst as any).action_by?.username) : '') || '';

            if (isApproved) {
              circleClass = "bg-emerald-500 text-white border-emerald-600 font-bold shadow-sm";
              iconNode = <Check className="w-3.5 h-3.5" />;
              labelBadge = actionUserDisplay ? `Approved by ${actionUserDisplay}` : `Approved (${labelBadge || 'Level ' + stepOrderNum})`;
            } else if (isPending) {
              circleClass = "bg-amber-500 text-white border-amber-600 font-bold animate-pulse shadow-md ring-2 ring-amber-500/30";
              iconNode = step.step_order;
              labelBadge = `Pending (${labelBadge || 'Level ' + stepOrderNum})`;
            } else if (isRejected) {
              circleClass = "bg-error text-on-error border-error font-bold shadow-sm";
              iconNode = <X className="w-3.5 h-3.5" />;
              labelBadge = `Rejected by ${actionUserDisplay || 'User'}`;
            } else if (isRework) {
              circleClass = "bg-purple-600 text-white border-purple-700 font-bold shadow-sm";
              iconNode = <RotateCcw className="w-3.5 h-3.5" />;
              labelBadge = `Rework requested by ${actionUserDisplay || 'User'}`;
            } else if (isUpcoming) {
              circleClass = "bg-surface-container text-on-surface-variant/70 border-outline-variant/60";
              iconNode = step.step_order;
              labelBadge = `Upcoming (${labelBadge || 'Level ' + stepOrderNum})`;
            }

            // Connector line before this step (from previous node)
            const isPrevCompleted = idx === 0 ? true : (isFinished || (stepOrderNum <= activePendingOrder));

            return (
              <React.Fragment key={step.step_id || idx}>
                {/* CONNECTOR LINE */}
                <div className={`flex-1 h-0.5 mx-1 mt-3.5 transition-colors ${isPrevCompleted && (isApproved || isPending) ? 'bg-emerald-500' : 'bg-outline-variant'}`} />

                {/* STEP NODE */}
                <div className="flex flex-col items-center text-center shrink-0 w-[170px]">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs transition-all border shrink-0 ${circleClass}`}>
                    {iconNode}
                  </div>
                  <span className="text-[11px] font-semibold text-on-surface mt-1 line-clamp-1 w-full">{step.step_name}</span>
                  <span className="text-[9px] text-on-surface-variant line-clamp-1 w-full">{labelBadge}</span>

                  {stepInst && stepInst.actioned_at && (
                    <span className="text-[9px] text-on-surface-variant mt-0.5">
                      {new Date(stepInst.actioned_at).toLocaleDateString()}
                    </span>
                  )}

                  {(() => {
                    const stepNameNormalized = (step.step_name || '').toLowerCase().trim();
                    const collectedComments: Array<{
                      comment: string;
                      author?: string;
                      status?: string;
                      date?: string;
                    }> = [];

                    const seenComments = new Set<string>();

                    group.items.forEach(i => {
                      const itemStepName = (i.step_name || '').toLowerCase().trim();
                      if (itemStepName === stepNameNormalized || i.step_order === step.step_order) {
                        if (i.comments && String(i.comments).trim()) {
                          const cleanComment = String(i.comments).trim();
                          const authorName = i.action_by_full_name || i.action_by_username || (typeof (i as any).action_by === 'object' ? ((i as any).action_by?.full_name || (i as any).action_by?.username) : (i as any).action_by) || '';
                          const key = `${cleanComment}_${authorName}`;
                          if (!seenComments.has(key)) {
                            seenComments.add(key);
                            collectedComments.push({
                              comment: cleanComment,
                              author: authorName,
                              status: i.status,
                              date: i.actioned_at ? new Date(i.actioned_at).toLocaleDateString() : undefined
                            });
                          }
                        }
                      }
                    });

                    if (collectedComments.length === 0) return null;

                    return (
                      <div className="mt-2 p-2 rounded-lg bg-surface-container border border-outline-variant text-[11px] text-on-surface w-full shadow-sm text-left font-sans space-y-1.5">
                        <div className="flex items-center gap-1 font-semibold text-[9px] text-primary not-italic uppercase tracking-wider">
                          <MessageSquare className="w-2.5 h-2.5 shrink-0" /> Comment{collectedComments.length > 1 ? `s (${collectedComments.length})` : ''}:
                        </div>
                        {collectedComments.map((c, cIdx) => (
                          <div key={cIdx} className={`text-[10px] ${cIdx > 0 ? 'pt-1.5 border-t border-outline-variant/60' : ''}`}>
                            <p className="italic text-on-surface font-normal">"{c.comment}"</p>
                            {(c.author || c.date) && (
                              <span className="text-[8px] text-on-surface-variant/80 block mt-0.5 font-medium">
                                - {c.author} {c.date ? `(${c.date})` : ''}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </React.Fragment>
            );
          })}

          {/* CONNECTOR LINE TO END */}
          <div className={`flex-1 h-0.5 mx-1 mt-3.5 transition-colors ${isFinished ? 'bg-emerald-500' : 'bg-outline-variant'}`} />

          {/* END NODE */}
          <div className="flex flex-col items-center shrink-0 w-16">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border shrink-0 ${isFinished ? 'bg-emerald-500 text-white border-emerald-600' : 'bg-surface-container-high text-on-surface-variant border-outline'}`}>
              End
            </div>
            <span className="text-[10px] text-on-surface-variant mt-1 font-medium">Disbursement</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Controls Bar */}
      <div className="p-3.5 rounded border border-outline-variant bg-surface-container flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        {/* Role Toggle Selector */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setRoleFilterOnly(true)}
            className={`px-3 py-1.5 rounded-md font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${roleFilterOnly
              ? 'bg-primary text-on-primary font-semibold shadow-xs'
              : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant'
              }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Assigned to My Role ({currentUser?.role?.role_name || currentUser?.role || 'My Role'})</span>
          </button>
          <button
            type="button"
            onClick={() => setRoleFilterOnly(false)}
            className={`px-3 py-1.5 rounded-md font-medium text-xs transition-colors flex items-center gap-1.5 cursor-pointer ${!roleFilterOnly
              ? 'bg-primary text-on-primary font-semibold shadow-xs'
              : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-outline-variant'
              }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All System Workflows</span>
          </button>
        </div>

        {/* Entity Type Tabs */}
        {!fixedEntityType && (
          <div className="flex items-center gap-1 bg-surface-container-low border border-outline-variant p-1 rounded-md">
            {(['ALL', 'Bundle', 'Ledger', 'Expense'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setApprovalEntityTab(type)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${approvalEntityTab === type
                  ? 'bg-primary/10 text-primary font-semibold border border-primary/30'
                  : 'text-on-surface-variant hover:text-on-surface'
                  }`}
              >
                {type === 'ALL' ? 'All Entities' : `${type}s`}
              </button>
            ))}
          </div>
        )}

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-surface-container-low border border-outline-variant p-1 rounded-md">
          {[
            { key: 'ALL', label: 'All Status' },
            { key: 'Pending', label: 'Pending' },
            { key: 'Approved', label: 'Approved' },
            { key: 'Rejected', label: 'Rejected' },
            { key: 'Rework', label: 'Rework' }
          ].map((st) => (
            <button
              key={st.key}
              type="button"
              onClick={() => setApprovalStatusTab(st.key)}
              className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${approvalStatusTab === st.key
                ? 'bg-primary/10 text-primary font-semibold border border-primary/30'
                : 'text-on-surface-variant hover:text-on-surface'
                }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table Container */}
      <div className="border border-outline-variant rounded overflow-hidden bg-surface-container flex flex-col">
        <div className="p-3 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-on-surface">Multi-Step Approval Queue & Pipeline</span>
          </div>
          <span className="text-xs text-on-surface-variant font-medium">Showing {displayedApprovals.length} of {roleFilteredApprovals.length} workflow instances</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-on-surface-variant flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading approval queue...
          </div>
        ) : displayedApprovals.length === 0 ? (
          <div className="p-12 text-center text-on-surface-variant space-y-2">
            <Clock className="w-8 h-8 mx-auto text-outline" />
            <p className="text-xs font-medium text-on-surface">No approval requests found for selected filters</p>
            <p className="text-xs">Try changing the entity or status tab filters above.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-xs text-left text-on-surface">
                <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[10px] tracking-wider border-b border-outline-variant">
                  <tr>
                    <th className="w-8 px-2 py-3"></th>
                    <th className="px-4 py-3">Instance ID</th>
                    <th className="px-4 py-3">Target Entity</th>
                    <th className="px-4 py-3">Workflow Step</th>
                    <th className="px-4 py-3">Assigned Role</th>
                    <th className="px-4 py-3">Worker / Requester</th>
                    <th className="px-4 py-3">Expense Bill</th>
                    <th className="px-4 py-3 text-right">Amount (KD)</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {paginatedApprovals.map((app) => {
                    const isExpanded = !!expandedApprovalIds[app.instance_id];
                    const target = app.target_summary;
                    const entityType = target?.type || (app.claim ? 'Bundle' : (app.ledger ? 'Ledger' : 'Expense'));
                    const targetLabel = target?.label || (app.claim ? `Bundle ${app.claim}` : app.ledger ? `Ledger ${app.ledger}` : `Expense ${app.expense}`);
                    const rowMedia: any[] = target?.type === 'Expense'
                      ? (target?.receipts || [])
                      : target?.type === 'Bundle'
                        ? (target?.expenses || []).flatMap((e: any) => e.receipts || [])
                        : [
                          ...(target?.bundles || []).flatMap((b: any) => (b.expenses || []).flatMap((e: any) => e.receipts || [])),
                          ...(target?.expenses || []).flatMap((e: any) => e.receipts || [])
                        ];

                    return (
                      <React.Fragment key={app.instance_id}>
                        <tr
                          onClick={() => toggleExpandApproval(app.instance_id)}
                          className={`transition-colors cursor-pointer ${isExpanded
                            ? 'bg-primary/10 dark:bg-primary/20 border-l-4 border-l-primary'
                            : 'hover:bg-surface-container-high'
                            }`}
                        >
                          <td className="px-2 py-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpandApproval(app.instance_id);
                              }}
                              className={`p-1 rounded transition-colors cursor-pointer ${isExpanded
                                ? 'bg-primary text-on-primary shadow-xs'
                                : 'hover:bg-surface-container-highest text-on-surface-variant'
                                }`}
                            >
                              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                          </td>
                          <td className="px-4 py-3 font-medium text-on-surface">{app.instance_id}</td>
                          <td className="px-4 py-3 font-medium">
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-primary">{targetLabel}</span>
                              <div className="flex items-center gap-1.5 flex-wrap">


                                {/* Ticket Details Badge for Bundle / Expense */}

                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-on-surface">{app.step_name}</td>
                          <td className="px-4 py-3 text-on-surface-variant font-medium">{app.assigned_role_name}</td>
                          <td className="px-4 py-3 text-on-surface-variant">
                            {target?.worker || app.action_by_full_name || app.action_by_username || 'N/A'}
                          </td>
                          <td className="px-4 py-3">
                            {rowMedia.length === 0 ? (
                              <span className="text-on-surface-variant/40 italic text-[11px]">None</span>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                {rowMedia.slice(0, 2).map((m: any, mIdx: number) => {
                                  const url = getMediaUrl(m.file_url);
                                  const isImg = isImage(m.file_name);
                                  const isAud = isAudio(m.file_name);
                                  const isVid = isVideo(m.file_name);

                                  return (
                                    <button
                                      key={m.media_id || mIdx}
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setMediaPreviewState({ items: rowMedia, index: mIdx });
                                      }}
                                      className="w-7 h-7 rounded border border-outline-variant bg-surface-container-high overflow-hidden hover:border-primary transition-all relative flex items-center justify-center cursor-pointer shadow-xs group"
                                      title={`Preview ${m.file_name || 'Receipt'}`}
                                    >
                                      {isImg ? (
                                        <img
                                          src={url}
                                          alt={m.file_name}
                                          style={{ transform: `rotate(${m.rotation || 0}deg)` }}
                                          className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                        />
                                      ) : isAud ? (
                                        <Headphones className="w-3.5 h-3.5 text-primary" />
                                      ) : isVid ? (
                                        <Video className="w-3.5 h-3.5 text-primary" />
                                      ) : (
                                        <FileText className="w-3.5 h-3.5 text-on-surface-variant" />
                                      )}
                                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                    </button>
                                  );
                                })}
                                {rowMedia.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setMediaPreviewState({ items: rowMedia, index: 2 });
                                    }}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
                                    title={`+${rowMedia.length - 2} more media files`}
                                  >
                                    +{rowMedia.length - 2}
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {target?.amount ? `${parseFloat(target.amount).toFixed(3)}` : '-'}
                          </td>
                          <td className="px-4 py-3">{renderStatusBadge(app.status, app.status === 'Pending' && (isAdmin || app.can_action === true), app.step_name)}</td>
                          <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            {app.status === 'Pending' && (app.can_action || isAdmin) ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowApprovalModal(app);
                                  setApprovalAction('APPROVED');
                                  setApprovalComments('');
                                }}
                                className="px-2.5 py-1 rounded bg-primary text-on-primary text-[11px] font-medium hover:bg-primary-container transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                <span>Review / Action</span>
                              </button>
                            ) : null}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="bg-primary/5 dark:bg-primary/10 border-l-4 border-l-primary">
                            <td colSpan={10} className="px-6 py-4 border-b border-outline-variant space-y-3">
                              {renderApprovalStepper({
                                label: targetLabel,
                                type: entityType,
                                id: target?.id || 0,
                                items: app.approval_history && app.approval_history.length > 0 ? (app.approval_history as any) : [app]
                              })}

                              {/* Single Expense Target Details Card */}
                              {target?.type === 'Expense' && (
                                <div className="p-3.5 rounded-lg border border-outline-variant bg-surface-container space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant pb-2">
                                    <div className="flex items-center gap-2">
                                      <FileText className="w-4 h-4 text-primary" />
                                      <span className="text-xs font-semibold text-on-surface">Target Expense Details & Context</span>
                                    </div>

                                    {target?.ticket && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedTicketForModal(target.ticket);
                                        }}
                                        className="px-2.5 py-1 rounded bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                                      >
                                        <Ticket className="w-3.5 h-3.5" />
                                        <span>{target.ticket.work_order_no}</span>
                                        <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
                                      </button>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                    {target?.expense_type_name && (
                                      <div>
                                        <span className="text-[10px] text-on-surface-variant font-medium block">Expense Type</span>
                                        <span className="text-on-surface font-semibold">{target.expense_type_name}</span>
                                      </div>
                                    )}
                                    {target?.expense_date && (
                                      <div>
                                        <span className="text-[10px] text-on-surface-variant font-medium block">Expense Date</span>
                                        <span className="text-on-surface">{target.expense_date}</span>
                                      </div>
                                    )}
                                    {target?.amount && (
                                      <div>
                                        <span className="text-[10px] text-on-surface-variant font-medium block">Amount</span>
                                        <span className="text-emerald-600 font-bold">{parseFloat(target.amount).toFixed(3)} KD</span>
                                      </div>
                                    )}
                                    {target?.worker && (
                                      <div>
                                        <span className="text-[10px] text-on-surface-variant font-medium block">Technician</span>
                                        <span className="text-on-surface font-medium">{target.worker}</span>
                                      </div>
                                    )}
                                  </div>

                                  {getCleanRemarks(target?.remarks) && (
                                    <div className="text-xs bg-surface-container-low p-2 rounded border border-outline-variant">
                                      <span className="text-[10px] font-medium text-on-surface-variant block mb-0.5">Remarks / Description:</span>
                                      <p className="text-on-surface">{getCleanRemarks(target.remarks)}</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Bundle Target Overview Card */}
                              {target?.type === 'Bundle' && (
                                <div className="p-3.5 rounded-lg border border-outline-variant bg-surface-container space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant pb-2">
                                    <div className="flex items-center gap-2">
                                      <Layers className="w-4 h-4 text-primary" />
                                      <span className="text-xs font-semibold text-on-surface">Bundle Summary & Attached Tickets</span>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                    {target?.worker && (
                                      <div>
                                        <span className="text-[10px] text-on-surface-variant font-medium block">Technician</span>
                                        <span className="text-on-surface font-semibold">{target.worker}</span>
                                      </div>
                                    )}
                                    {target?.amount && (
                                      <div>
                                        <span className="text-[10px] text-on-surface-variant font-medium block">Total Bundle Amount</span>
                                        <span className="text-emerald-600 font-bold">KD {parseFloat(target.amount).toFixed(3)}</span>
                                      </div>
                                    )}
                                    {(target?.period_from || target?.period_to) && (
                                      <div>
                                        <span className="text-[10px] text-on-surface-variant font-medium block">Billing Period</span>
                                        <span className="text-on-surface">{target.period_from || 'N/A'} → {target.period_to || 'N/A'}</span>
                                      </div>
                                    )}
                                    {target?.store_name && (
                                      <div>
                                        <span className="text-[10px] text-on-surface-variant font-medium block">Store Location</span>
                                        <span className="text-on-surface font-medium">{target.store_name}</span>
                                      </div>
                                    )}
                                  </div>

                                  {getCleanRemarks(target?.remarks) && (
                                    <div className="text-xs bg-surface-container-low p-2 rounded border border-outline-variant">
                                      <span className="text-[10px] font-medium text-on-surface-variant block mb-0.5">Bundle Remarks / Description:</span>
                                      <p className="text-on-surface">{getCleanRemarks(target.remarks)}</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Ledger Target Overview Card */}
                              {target?.type === 'Ledger' && (
                                <div className="p-3.5 rounded-lg border border-outline-variant bg-surface-container space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant pb-2">
                                    <div className="flex items-center gap-2">
                                      <Building2 className="w-4 h-4 text-primary" />
                                      <span className="text-xs font-semibold text-on-surface">Ledger Batch Details & Allocation</span>
                                    </div>
                                    {target.tickets && target.tickets.length > 0 && (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] text-on-surface-variant font-medium">Tickets:</span>
                                        {target.tickets.map((t) => (
                                          <button
                                            key={t.ticket_id}
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setSelectedTicketForModal(t);
                                            }}
                                            className="px-2 py-0.5 rounded bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                                          >
                                            <Ticket className="w-3 h-3" />
                                            <span>{t.work_order_no}</span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                    <div>
                                      <span className="text-[10px] text-on-surface-variant font-medium block">Total Batch Amount</span>
                                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">KD {target.amount ? parseFloat(target.amount).toFixed(3) : '0.000'}</span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-on-surface-variant font-medium block">Included Bundles</span>
                                      <span className="text-on-surface font-semibold">{target.bundles?.length || 0} Claim Bundles</span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-on-surface-variant font-medium block">Direct Expenses</span>
                                      <span className="text-on-surface font-semibold">{target.expenses?.length || 0} Expenses</span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] text-on-surface-variant font-medium block">Store Location</span>
                                      <span className="text-on-surface font-medium">{target.store_name || 'General Location'}</span>
                                    </div>
                                  </div>

                                  {target?.remarks && (
                                    <div className="text-xs bg-surface-container-low p-2 rounded border border-outline-variant">
                                      <span className="text-[10px] font-medium text-on-surface-variant block mb-0.5">Ledger Remarks</span>
                                      <p className="text-on-surface">{target.remarks}</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* LEVEL 2 & 3: Nested Bundles Accordion for Ledger Batch Target */}
                              {target?.type === 'Ledger' && (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-on-surface flex items-center gap-2">
                                      <Layers className="w-3.5 h-3.5 text-primary" />
                                      <span>Included Worker Claim Bundles ({target.bundles?.length || 0})</span>
                                    </span>
                                  </div>

                                  {(!target.bundles || target.bundles.length === 0) ? (
                                    <p className="text-xs text-on-surface-variant italic bg-surface-container p-3 rounded border border-outline-variant">
                                      No worker claim bundles attached to this ledger.
                                    </p>
                                  ) : (
                                    <div className="border border-outline-variant rounded-lg overflow-x-auto bg-surface-container shadow-xs">
                                      <table className="w-full text-xs text-left text-on-surface">
                                        <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[9px] tracking-wider border-b border-outline-variant">
                                          <tr>
                                            <th className="w-6 px-2 py-2"></th>
                                            <th className="px-3 py-2">Claim ID</th>
                                            <th className="px-3 py-2">Technician / Worker</th>
                                            <th className="px-3 py-2 text-right">Amount ($)</th>
                                            <th className="px-3 py-2">Status</th>
                                            <th className="px-3 py-2">Expense Bill</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-outline-variant">
                                          {target.bundles.map((b: any) => {
                                            const isBundleExpanded = !!expandedBundleIds[b.claim_id];
                                            const bundleExpenses = Array.isArray(b.expenses) ? b.expenses : [];
                                            const bundleMedia = bundleExpenses.flatMap((e: any) => e.receipts || []);

                                            return (
                                              <React.Fragment key={b.claim_id}>
                                                {/* Level 2: Bundle Row */}
                                                <tr
                                                  className={`transition-colors cursor-pointer ${isBundleExpanded
                                                    ? 'bg-primary/15 dark:bg-primary/25 border-l-4 border-l-primary'
                                                    : 'hover:bg-surface-container-high'
                                                    }`}
                                                  onClick={() => toggleExpandBundle(b.claim_id)}
                                                >
                                                  <td className="px-2 py-2 text-center">
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleExpandBundle(b.claim_id);
                                                      }}
                                                      className="p-0.5 rounded hover:bg-surface-container-highest text-on-surface-variant transition-colors cursor-pointer text-[10px]"
                                                    >
                                                      {isBundleExpanded ? '▼' : '▶'}
                                                    </button>
                                                  </td>
                                                  <td className="px-3 py-2 font-medium text-primary">
                                                    Bundle {b.claim_id}
                                                    {bundleExpenses.length > 0 && (
                                                      <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-semibold">
                                                        {bundleExpenses.length} exp
                                                      </span>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-2 font-medium">
                                                    {b.worker_detail?.full_name || b.worker_detail?.username || (typeof b.worker === 'object' ? (b.worker?.full_name || b.worker?.username) : b.worker) || 'N/A'}
                                                  </td>
                                                  <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                    {parseFloat(b.total_claimed_amount).toFixed(3)}
                                                  </td>
                                                  <td className="px-3 py-2">{renderStatusBadge(b.status)}</td>
                                                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                                                    {bundleMedia.length === 0 ? (
                                                      <span className="text-[10px] text-on-surface-variant/40 italic">None</span>
                                                    ) : (
                                                      <div className="flex items-center gap-1 flex-wrap">
                                                        {bundleMedia.slice(0, 2).map((m: any, mIdx: number) => {
                                                          const url = getMediaUrl(m.file_url);
                                                          const isImg = isImage(m.file_name);
                                                          const isAud = isAudio(m.file_name);
                                                          const isVid = isVideo(m.file_name);

                                                          return (
                                                            <button
                                                              key={m.media_id || mIdx}
                                                              type="button"
                                                              onClick={(e) => {
                                                                e.stopPropagation();
                                                                setMediaPreviewState({ items: bundleMedia, index: mIdx });
                                                              }}
                                                              className="w-6 h-6 rounded border border-outline-variant bg-surface-container-high overflow-hidden hover:border-primary transition-all relative flex items-center justify-center cursor-pointer shadow-xs group"
                                                              title={`Preview ${m.file_name || 'Receipt'}`}
                                                            >
                                                              {isImg ? (
                                                                <img
                                                                  src={url}
                                                                  alt={m.file_name}
                                                                  style={{ transform: `rotate(${m.rotation || 0}deg)` }}
                                                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                                                />
                                                              ) : isAud ? (
                                                                <Headphones className="w-3 h-3 text-primary" />
                                                              ) : isVid ? (
                                                                <Video className="w-3 h-3 text-primary" />
                                                              ) : (
                                                                <FileText className="w-3 h-3 text-on-surface-variant" />
                                                              )}
                                                            </button>
                                                          );
                                                        })}
                                                        {bundleMedia.length > 2 && (
                                                          <button
                                                            type="button"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              setMediaPreviewState({ items: bundleMedia, index: 2 });
                                                            }}
                                                            className="px-1 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer"
                                                            title={`+${bundleMedia.length - 2} more media files`}
                                                          >
                                                            +{bundleMedia.length - 2}
                                                          </button>
                                                        )}
                                                      </div>
                                                    )}
                                                  </td>
                                                </tr>

                                                {/* Level 3: Expenses inside Bundle */}
                                                {isBundleExpanded && (
                                                  <tr className="bg-primary/5 dark:bg-primary/10">
                                                    <td colSpan={6} className="px-4 py-3 border-b border-outline-variant">
                                                      <div className="ml-2 sm:ml-4 space-y-1.5">
                                                        <div className="flex items-center justify-between mb-1.5">
                                                          <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                                                            <Receipt className="w-3 h-3 text-primary" />
                                                            <span>Expenses in Bundle {b.claim_id} ({bundleExpenses.length})</span>
                                                          </p>
                                                        </div>

                                                        {bundleExpenses.length === 0 ? (
                                                          <p className="text-[11px] text-on-surface-variant italic">No expenses recorded in this bundle.</p>
                                                        ) : (
                                                          <div className="border border-outline-variant rounded overflow-x-auto bg-surface-container">
                                                            <table className="w-full text-[11px] text-left text-on-surface">
                                                              <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[9px] tracking-wider border-b border-outline-variant">
                                                                <tr>
                                                                  <th className="px-3 py-1.5">Exp</th>
                                                                  <th className="px-3 py-1.5">Category / Type</th>
                                                                  <th className="px-3 py-1.5">Worker</th>
                                                                  <th className="px-3 py-1.5">Ticket</th>
                                                                  <th className="px-3 py-1.5">Date</th>
                                                                  <th className="px-3 py-1.5">Remarks</th>
                                                                  <th className="px-3 py-1.5 text-right">Amount ($)</th>
                                                                  <th className="px-3 py-1.5">Expense Bill</th>
                                                                </tr>
                                                              </thead>
                                                              <tbody className="divide-y divide-outline-variant">
                                                                {bundleExpenses.map((exp: any) => (
                                                                  <tr key={exp.expense_id} className="hover:bg-surface-container-high transition-colors">
                                                                    <td className="px-3 py-1.5 font-medium text-primary">#{exp.expense_id}</td>
                                                                    <td className="px-3 py-1.5 text-on-surface font-semibold">{exp.expense_type_detail?.expense_name || exp.expense_type_name || 'General Expense'}</td>
                                                                    <td className="px-3 py-1.5 text-on-surface-variant">
                                                                      {exp.worker_detail?.full_name || exp.worker_detail?.username || exp.worker || b.worker_detail?.full_name || 'N/A'}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-[11px]">
                                                                      {exp.ticket_details ? (
                                                                        <button
                                                                          type="button"
                                                                          onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedTicketForModal(exp.ticket_details);
                                                                          }}
                                                                          className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold hover:underline cursor-pointer border-none p-0 inline-flex items-center gap-1 text-[11px]"
                                                                        >
                                                                          <Ticket className="w-3 h-3 text-primary shrink-0" />
                                                                          <span>{exp.ticket_details.work_order_no || exp.ticket_details.ticket_id}</span>
                                                                        </button>
                                                                      ) : exp.ticket ? (
                                                                        <button
                                                                          type="button"
                                                                          onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedTicketForModal(typeof exp.ticket === 'object' ? exp.ticket : { ticket_id: exp.ticket });
                                                                          }}
                                                                          className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold hover:underline cursor-pointer border-none p-0 inline-flex items-center gap-1 text-[11px]"
                                                                        >
                                                                          <Ticket className="w-3 h-3 text-primary shrink-0" />
                                                                          <span>{typeof exp.ticket === 'object' ? (exp.ticket.work_order_no || exp.ticket.ticket_id) : exp.ticket}</span>
                                                                        </button>
                                                                      ) : (
                                                                        <span className="text-on-surface-variant italic">-</span>
                                                                      )}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-on-surface-variant">{exp.expense_date || '-'}</td>
                                                                    <td className="px-3 py-1.5 text-on-surface-variant">{exp.remarks || '-'}</td>
                                                                    <td className="px-3 py-1.5 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                                      {parseFloat(exp.amount).toFixed(3)}
                                                                    </td>
                                                                    <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                                                                      {exp.receipts && exp.receipts.length > 0 ? (
                                                                        <div className="flex items-center gap-1 flex-wrap">
                                                                          {exp.receipts.map((file: any, fIdx: number) => {
                                                                            const url = getMediaUrl(file.file_url);
                                                                            const isImg = isImage(file.file_name);
                                                                            return (
                                                                              <button
                                                                                key={file.media_id || fIdx}
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                  e.stopPropagation();
                                                                                  setMediaPreviewState({ items: exp.receipts || [], index: fIdx });
                                                                                }}
                                                                                className="w-6 h-6 rounded border border-outline-variant bg-surface-container-high overflow-hidden hover:border-primary transition-all relative flex items-center justify-center cursor-pointer shadow-xs group"
                                                                                title={`Preview ${file.file_name || 'Receipt'}`}
                                                                              >
                                                                                {isImg ? (
                                                                                  <img
                                                                                    src={url}
                                                                                    alt={file.file_name}
                                                                                    style={{ transform: `rotate(${file.rotation || 0}deg)` }}
                                                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                                                                  />
                                                                                ) : isAudio(file.file_name) ? (
                                                                                  <Headphones className="w-3 h-3 text-primary" />
                                                                                ) : isVideo(file.file_name) ? (
                                                                                  <Video className="w-3 h-3 text-primary" />
                                                                                ) : (
                                                                                  <FileText className="w-3 h-3 text-on-surface-variant" />
                                                                                )}
                                                                              </button>
                                                                            );
                                                                          })}
                                                                        </div>
                                                                      ) : (
                                                                        <span className="text-[10px] text-on-surface-variant italic">No receipts</span>
                                                                      )}
                                                                    </td>
                                                                  </tr>
                                                                ))}
                                                              </tbody>
                                                            </table>
                                                          </div>
                                                        )}
                                                      </div>
                                                    </td>
                                                  </tr>
                                                )}
                                              </React.Fragment>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Direct or Single Bundle Included Expenses Table */}
                              {(target?.type === 'Bundle' || (target?.type === 'Ledger' && target?.expenses && target.expenses.length > 0)) && (
                                <div className="border border-outline-variant rounded-lg overflow-hidden bg-surface-container shadow-xs space-y-0">
                                  <div className="p-3 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <Receipt className="w-4 h-4 text-primary" />
                                      <span className="text-xs font-semibold text-on-surface">
                                        {target.type === 'Ledger' ? 'Direct Unbundled Expenses' : `Expenses Included in ${entityType}`} ({target.expenses?.length || 0} expenses)
                                      </span>
                                    </div>
                                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                      {target.type === 'Bundle' ? `Total Claimed Amount: KD ${target.amount ? parseFloat(target.amount).toFixed(3) : '0.000'}` : ''}
                                    </span>
                                  </div>

                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left">
                                      <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[9px] tracking-wider border-b border-outline-variant">
                                        <tr>
                                          <th className="px-3 py-2">Exp ID</th>
                                          <th className="px-3 py-2">Category / Type</th>
                                          <th className="px-3 py-2">Technician / Worker</th>
                                          <th className="px-3 py-2">Ticket</th>
                                          <th className="px-3 py-2">Date</th>
                                          <th className="px-3 py-2">Remarks</th>
                                          <th className="px-3 py-2 text-right">Amount (KD)</th>
                                          <th className="px-3 py-2">Expense Bill</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-outline-variant">
                                        {(target.expenses || []).map((exp) => (
                                          <tr key={exp.expense_id} className="hover:bg-surface-container-high transition-colors">
                                            <td className="px-3 py-2 font-medium text-on-surface">{exp.expense_id}</td>
                                            <td className="px-3 py-2 font-semibold text-on-surface">{exp.expense_type_name || 'General Expense'}</td>
                                            <td className="px-3 py-2 text-on-surface-variant">{exp.worker || target.worker || '-'}</td>
                                            <td className="px-3 py-2 text-[11px]">
                                              {(exp as any).ticket_details ? (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedTicketForModal((exp as any).ticket_details);
                                                  }}
                                                  className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold hover:underline cursor-pointer border-none p-0 inline-flex items-center gap-1 text-[11px]"
                                                >
                                                  <Ticket className="w-3 h-3 text-primary shrink-0" />
                                                  <span>{(exp as any).ticket_details.work_order_no || (exp as any).ticket_details.ticket_id}</span>
                                                </button>
                                              ) : exp.ticket ? (
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedTicketForModal(typeof exp.ticket === 'object' ? exp.ticket : { ticket_id: exp.ticket });
                                                  }}
                                                  className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold hover:underline cursor-pointer border-none p-0 inline-flex items-center gap-1 text-[11px]"
                                                >
                                                  <Ticket className="w-3 h-3 text-primary shrink-0" />
                                                  <span>{typeof exp.ticket === 'object' ? (exp.ticket.work_order_no || exp.ticket.ticket_id) : exp.ticket}</span>
                                                </button>
                                              ) : (
                                                <span className="text-on-surface-variant italic">-</span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 text-on-surface-variant">{exp.expense_date || '-'}</td>
                                            <td className="px-3 py-2 text-on-surface-variant">{exp.remarks || '-'}</td>
                                            <td className="px-3 py-2 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                              {parseFloat(exp.amount).toFixed(3)}
                                            </td>
                                            <td className="px-3 py-2">
                                              {exp.receipts && exp.receipts.length > 0 ? (
                                                <div className="flex items-center gap-1 flex-wrap">
                                                  {exp.receipts.map((file: any, fIdx: number) => {
                                                    const url = getMediaUrl(file.file_url);
                                                    const isImg = isImage(file.file_name);
                                                    return (
                                                      <button
                                                        key={file.media_id || fIdx}
                                                        type="button"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setMediaPreviewState({ items: exp.receipts || [], index: fIdx });
                                                        }}
                                                        className="w-7 h-7 rounded border border-outline-variant bg-surface-container-high overflow-hidden hover:border-primary transition-all relative flex items-center justify-center cursor-pointer shadow-xs group"
                                                        title={`Preview ${file.file_name || 'Receipt'}`}
                                                      >
                                                        {isImg ? (
                                                          <img
                                                            src={url}
                                                            alt={file.file_name}
                                                            style={{ transform: `rotate(${file.rotation || 0}deg)` }}
                                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                                                          />
                                                        ) : isAudio(file.file_name) ? (
                                                          <Headphones className="w-3.5 h-3.5 text-primary" />
                                                        ) : isVideo(file.file_name) ? (
                                                          <Video className="w-3.5 h-3.5 text-primary" />
                                                        ) : (
                                                          <FileText className="w-3.5 h-3.5 text-on-surface-variant" />
                                                        )}
                                                      </button>
                                                    );
                                                  })}
                                                </div>
                                              ) : (
                                                <span className="text-[10px] text-on-surface-variant italic">No receipts</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Component */}
            <Pagination
              currentPage={currentPage}
              totalItems={displayedApprovals.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(num) => {
                setItemsPerPage(num);
                setCurrentPage(1);
              }}
            />
          </>
        )}
      </div>

      {/* MODAL: ACTION APPROVAL */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-surface-container rounded border border-outline-variant max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-outline-variant pb-3">
              <h3 className="text-sm font-semibold text-on-surface">Action Approval Step: {showApprovalModal.step_name}</h3>
              <button onClick={() => setShowApprovalModal(null)}><X className="w-4 h-4 text-on-surface-variant" /></button>
            </div>

            <div className="space-y-3">
              {/* Target Entity Overview Banner */}
              {(() => {
                const target = showApprovalModal.target_summary;
                if (!target) return null;
                const ticketList = target?.tickets && target.tickets.length > 0
                  ? target.tickets
                  : (target?.ticket ? [target.ticket] : []);

                return (
                  <div className="p-3 rounded-lg bg-surface-container-low border border-outline-variant/70 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-primary">{target.label || `${target.type} ${target.id}`}</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {target.amount ? parseFloat(target.amount).toFixed(3) : '0.000'} KD
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {target.worker && (
                        <div>
                          <span className="text-on-surface-variant text-[10px] block">Technician:</span>
                          <span className="font-medium text-on-surface">{target.worker}</span>
                        </div>
                      )}
                      {target.store_name && (
                        <div>
                          <span className="text-on-surface-variant text-[10px] block">Location:</span>
                          <span className="font-medium text-on-surface">{target.store_name}</span>
                        </div>
                      )}
                    </div>

                    {/* Linked Tickets */}
                    {ticketList.length > 0 && (
                      <div className="pt-1.5 border-t border-outline-variant/40">
                        <span className="text-on-surface-variant text-[10px] block mb-1">Attached Ticket(s):</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ticketList.map((t: any, idx: number) => (
                            <button
                              key={t.ticket_id || idx}
                              type="button"
                              onClick={() => setSelectedTicketForModal(t)}
                              className="px-2 py-0.5 rounded bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-[10px] font-mono font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                              title={t.title ? `${t.work_order_no || t.ticket_id}: ${t.title}` : undefined}
                            >
                              <Ticket className="w-3 h-3" />
                              <span>{t.work_order_no || `${t.ticket_id}`}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {getCleanRemarks(target.remarks) && (
                      <div className="pt-1 border-t border-outline-variant/40">
                        <span className="text-on-surface-variant text-[10px] block">Remarks / Description:</span>
                        <p className="text-on-surface text-[11px] italic mt-0.5">{getCleanRemarks(target.remarks)}</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Target Media Preview in Action Modal if available */}
              {(() => {
                const target = showApprovalModal.target_summary;
                const modalMedia = target?.type === 'Expense'
                  ? (target?.receipts || [])
                  : (target?.expenses || []).flatMap((e: any) => e.receipts || []);
                if (modalMedia.length === 0) return null;
                return (
                  <div className="p-2.5 rounded bg-surface-container-low border border-outline-variant/60 space-y-1.5">
                    <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1">
                      <Paperclip className="w-3 h-3 text-primary" /> Attached Expense Bill ({modalMedia.length})
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {modalMedia.map((file: any, fIdx: number) => {
                        const url = getMediaUrl(file.file_url);
                        const isImg = isImage(file.file_name);
                        return (
                          <button
                            key={file.media_id || fIdx}
                            type="button"
                            onClick={() => setMediaPreviewState({ items: modalMedia, index: fIdx })}
                            className="w-8 h-8 rounded border border-outline-variant bg-surface-container-high overflow-hidden hover:border-primary transition-all relative flex items-center justify-center cursor-pointer shadow-xs group"
                            title={`Preview ${file.file_name}`}
                          >
                            {isImg ? (
                              <img src={url} alt={file.file_name} style={{ transform: `rotate(${file.rotation || 0}deg)` }} className="w-full h-full object-cover group-hover:scale-105" />
                            ) : isAudio(file.file_name) ? (
                              <Headphones className="w-3.5 h-3.5 text-primary" />
                            ) : isVideo(file.file_name) ? (
                              <Video className="w-3.5 h-3.5 text-primary" />
                            ) : (
                              <FileText className="w-3.5 h-3.5 text-on-surface-variant" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Decision Action</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setApprovalAction('APPROVED')}
                    className={`py-2 text-xs font-medium rounded border cursor-pointer ${approvalAction === 'APPROVED' ? 'bg-emerald-500 text-white border-emerald-500 font-bold' : 'border-outline text-on-surface hover:bg-surface-container-high'}`}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setApprovalAction('REWORK')}
                    className={`py-2 text-xs font-medium rounded border cursor-pointer ${approvalAction === 'REWORK' ? 'bg-purple-500 text-white border-purple-500 font-bold' : 'border-outline text-on-surface hover:bg-surface-container-high'}`}
                  >
                    Rework
                  </button>
                </div>
              </div>

              {/* Ledger Group Reassignment Option for Ledger Rework */}
              {(() => {
                const isTargetLedger = showApprovalModal?.target_summary?.type === 'Ledger' ||
                  !!showApprovalModal?.ledger ||
                  (showApprovalModal as any)?.workflow_entity_type?.toUpperCase() === 'LEDGER';

                if (approvalAction !== 'REWORK' || !isTargetLedger) return null;

                return (
                  <div className="p-3 rounded-lg bg-surface-container-low border border-purple-500/40 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
                        <FolderKanban className="w-3.5 h-3.5" />
                        Ledger Group Assignment (Rework)
                      </span>
                      <span className="text-[10px] text-on-surface-variant font-medium">Optional</span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setReworkGroupMode('keep')}
                        className={`py-1 px-1.5 rounded border text-center font-medium cursor-pointer transition-colors ${reworkGroupMode === 'keep'
                          ? 'bg-purple-600 text-white border-purple-600 font-bold'
                          : 'border-outline text-on-surface-variant hover:bg-surface-container-high'
                          }`}
                      >
                        Keep Current
                      </button>
                      <button
                        type="button"
                        onClick={() => setReworkGroupMode('existing')}
                        className={`py-1 px-1.5 rounded border text-center font-medium cursor-pointer transition-colors ${reworkGroupMode === 'existing'
                          ? 'bg-purple-600 text-white border-purple-600 font-bold'
                          : 'border-outline text-on-surface-variant hover:bg-surface-container-high'
                          }`}
                      >
                        Select Another
                      </button>
                      <button
                        type="button"
                        onClick={() => setReworkGroupMode('new')}
                        className={`py-1 px-1.5 rounded border text-center font-medium cursor-pointer transition-colors ${reworkGroupMode === 'new'
                          ? 'bg-purple-600 text-white border-purple-600 font-bold'
                          : 'border-outline text-on-surface-variant hover:bg-surface-container-high'
                          }`}
                      >
                        Create New
                      </button>
                    </div>

                    {reworkGroupMode === 'existing' && (
                      <div className="space-y-1 pt-1">
                        <label className="text-[11px] font-medium text-on-surface-variant block">Select Existing Ledger Group</label>
                        <SearchableSelect
                          options={reworkGroupOptions}
                          value={reworkTargetGroupId}
                          onChange={(val) => setReworkTargetGroupId(val)}
                          placeholder="Search latest 10 groups or type name..."
                          onSearchChange={handleSearchReworkGroups}
                          loading={loadingReworkGroups}
                        />
                      </div>
                    )}

                    {reworkGroupMode === 'new' && (
                      <div className="space-y-1 pt-1">
                        <label className="text-[11px] font-medium text-on-surface-variant block">New Ledger Group Name</label>
                        <input
                          type="text"
                          value={reworkNewGroupName}
                          onChange={(e) => setReworkNewGroupName(e.target.value)}
                          placeholder="e.g. Q1 Maintenance Group..."
                          className="w-full bg-surface-container border border-outline text-on-surface text-xs rounded p-2 focus:border-primary focus:outline-none"
                        />
                      </div>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1">Comments & Rationale</label>
                <textarea
                  value={approvalComments}
                  onChange={(e) => setApprovalComments(e.target.value)}
                  placeholder="Reason for approval or rework..."
                  className="w-full bg-surface-container border border-outline text-on-surface text-xs rounded p-2 h-20"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-outline-variant">
              <button
                onClick={() => setShowApprovalModal(null)}
                disabled={submitting}
                className="px-3 py-1.5 rounded border border-outline text-xs text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleActionApproval(
                  approvalAction,
                  approvalComments,
                  showApprovalModal,
                  reworkGroupMode === 'existing' ? reworkTargetGroupId : null,
                  reworkGroupMode === 'new' ? reworkNewGroupName : undefined
                )}
                disabled={submitting}
                className="px-4 py-1.5 rounded bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5 shadow-xs"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-on-primary" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>Submit Decision</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX MEDIA PREVIEW MODAL */}
      {mediaPreviewState && (
        <MediaPreviewModal
          items={mediaPreviewState.items}
          previewIndex={mediaPreviewState.index}
          onClose={() => setMediaPreviewState(null)}
        />
      )}
    </div>
  );
};
