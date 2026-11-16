import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Maximize2,
  Paperclip,
  Receipt,
  RotateCw,
  X,
} from 'lucide-react';
import type { ExpenseItem, MediaFileItem } from './types';
import { formatDateDMY } from './types';
import { getMediaUrl } from '../ticket/TicketsTypesAndComponents';
import { ZoomableImage } from '@/components/ZoomableImage';

export interface ExpensePreviewModalProps {
  expense: ExpenseItem | null;
  onClose: () => void;
  fallbackWorker?: any;
  zIndexClass?: string;
  setPreviewMediaUrl?: (media: { url: string; title: string } | null) => void;
  setSelectedTicketForModal?: (ticket: any) => void;
}

const cleanRemarksText = (raw?: string): string => {
  if (!raw) return '';
  return raw
    .split('\n')
    .filter((line) => !line.trim().match(/^\[.+?\]:/))
    .join('\n')
    .trim();
};

const resolveReceiptUrl = (receipt?: MediaFileItem | null): string => {
  if (!receipt) return '';
  const r = receipt as any;
  return getMediaUrl(r.file_url || r.file || r.file_path || r.url || '');
};

export const ExpensePreviewModal: React.FC<ExpensePreviewModalProps> = ({
  expense,
  onClose,
  fallbackWorker,
  zIndexClass = 'z-[60]',
  setPreviewMediaUrl,
  setSelectedTicketForModal,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [rotation, setRotation] = useState(0);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const receiptsList = useMemo<MediaFileItem[]>(() => {
    if (!expense) return [];
    const list: MediaFileItem[] = [];
    if (expense.receipt) list.push(expense.receipt);
    if (expense.receipts && Array.isArray(expense.receipts)) {
      expense.receipts.forEach((r) => {
        if (
          !list.some(
            (ex) =>
              (ex.media_id && ex.media_id === r.media_id) ||
              (ex.file_url && ex.file_url === r.file_url)
          )
        ) {
          list.push(r);
        }
      });
    }
    return list;
  }, [expense]);

  useEffect(() => {
    setActiveIndex(0);
    setRotation(0);
  }, [expense?.expense_id]);

  useEffect(() => {
    if (!expense) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && receiptsList.length > 1) {
        setActiveIndex((prev) => (prev - 1 + receiptsList.length) % receiptsList.length);
        setRotation(0);
      } else if (e.key === 'ArrowRight' && receiptsList.length > 1) {
        setActiveIndex((prev) => (prev + 1) % receiptsList.length);
        setRotation(0);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expense, receiptsList.length, onClose]);

  useEffect(() => {
    if (!expense) return;
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;

    const canScrollWithinDialog = (target: EventTarget | null, deltaY: number): boolean => {
      let node = target instanceof HTMLElement ? target : null;
      while (node && dialog && dialog.contains(node)) {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight;
        if (isScrollable) {
          const canScrollDown = deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1;
          const canScrollUp = deltaY < 0 && node.scrollTop > 1;
          if (canScrollDown || canScrollUp) return true;
        }
        if (node === dialog) break;
        node = node.parentElement;
      }
      return false;
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.defaultPrevented) return;
      if (!canScrollWithinDialog(e.target, e.deltaY)) {
        e.preventDefault();
      }
    };

    backdrop?.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      backdrop?.removeEventListener('wheel', handleWheel);
    };
  }, [expense]);

  if (!expense) return null;

  const safeIndex = activeIndex < receiptsList.length ? activeIndex : 0;
  const currentReceipt = receiptsList[safeIndex];
  const currentUrl = resolveReceiptUrl(currentReceipt);
  const isPdf =
    currentUrl.toLowerCase().endsWith('.pdf') || currentUrl.toLowerCase().includes('/pdf');

  const rawTicket = (expense.ticket_details || expense.ticket) as any;
  const ticketInfo =
    typeof rawTicket === 'object' && rawTicket !== null
      ? {
          id: rawTicket.ticket_id || rawTicket.id || null,
          workOrderNo: String(rawTicket.work_order_no || rawTicket.wo_no || ''),
          title:
            typeof rawTicket.title === 'string'
              ? rawTicket.title
              : rawTicket.title
                ? String(rawTicket.title)
                : '',
          description:
            typeof rawTicket.description === 'string'
              ? rawTicket.description
              : rawTicket.description
                ? String(rawTicket.description)
                : '',
          status:
            typeof rawTicket.status === 'object'
              ? rawTicket.status?.status_name || ''
              : rawTicket.status
                ? String(rawTicket.status)
                : '',
          priority:
            typeof rawTicket.priority === 'object'
              ? rawTicket.priority?.priority_name || ''
              : rawTicket.priority
                ? String(rawTicket.priority)
                : '',
          createdDate: rawTicket.created_date
            ? new Date(rawTicket.created_date).toLocaleDateString()
            : '',
          department:
            typeof rawTicket.department === 'object'
              ? rawTicket.department?.department_name || ''
              : rawTicket.department || rawTicket.department_name || '',
          location:
            typeof rawTicket.location === 'object'
              ? rawTicket.location?.location_name || ''
              : rawTicket.location || rawTicket.location_name || '',
          store:
            typeof rawTicket.store === 'object'
              ? rawTicket.store?.store_name || ''
              : rawTicket.store || rawTicket.store_name || '',
        }
      : typeof rawTicket === 'number' || typeof rawTicket === 'string'
        ? {
            id: rawTicket,
            workOrderNo: '',
            title: '',
            description: '',
            status: '',
            priority: '',
            createdDate: '',
            department: '',
            location: '',
            store: '',
          }
        : null;

  const workerObj = expense.worker_detail || expense.worker || fallbackWorker;
  const workerDisplayName =
    typeof workerObj === 'object' && workerObj !== null
      ? workerObj.name ||
        workerObj.full_name ||
        workerObj.username ||
        (workerObj.id ? `Worker ${workerObj.id}` : 'Technician')
      : typeof workerObj === 'number' || typeof workerObj === 'string'
        ? `Worker ${workerObj}`
        : 'Technician';

  const storeObj = expense.responsible_store || (expense as any).store_detail;
  const storeDisplayName =
    typeof storeObj === 'object' && storeObj !== null
      ? storeObj.store_name || (storeObj.store_id ? `Store ${storeObj.store_id}` : 'N/A')
      : typeof storeObj === 'number' || typeof storeObj === 'string'
        ? `Store ${storeObj}`
        : 'N/A';

  const expTypeObj = expense.expense_type_detail || expense.expense_type;
  const expTypeName =
    typeof expTypeObj === 'object' && expTypeObj !== null
      ? expTypeObj.expense_name || 'General Expense'
      : typeof expTypeObj === 'string'
        ? expTypeObj
        : 'General Expense';

  const isApproved =
    expense.approved === true ||
    (expense as any).approved === 'true' ||
    (expTypeObj && typeof expTypeObj === 'object' && (expTypeObj as any).approve_required === false);

  const remarksText = cleanRemarksText(expense.remarks);

  return (
    <div
      ref={backdropRef}
      className={`fixed inset-0 ${zIndexClass} bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overscroll-contain animate-in fade-in duration-150`}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="bg-surface-container rounded-lg border border-outline-variant/80 max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Pinned Modal Top Bar */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-outline-variant/80 bg-surface-container-low shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-2xs shrink-0">
              <Receipt className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-on-surface tracking-tight">
                  Expense #{expense.expense_id}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                  {expTypeName}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    isApproved
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25'
                  }`}
                >
                  {isApproved ? 'Approved' : 'Pending Approval'}
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant mt-0.5 truncate">
                Submitted by <strong className="text-on-surface">{workerDisplayName}</strong> on{' '}
                {formatDateDMY(expense.expense_date) || 'N/A'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer shrink-0"
            aria-label="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Split Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain lg:overflow-hidden grid grid-cols-1 lg:grid-cols-12">
          {/* Left Column: Receipt Showcase */}
          <div className="lg:col-span-7 flex flex-col gap-2.5 p-4 bg-surface-container-low/50 lg:border-r border-b lg:border-b-0 border-outline-variant/60 min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <span className="text-xs font-bold text-on-surface tracking-wider flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-primary" />
                <span>Receipt Preview</span>
              </span>
              {receiptsList.length > 0 && (
                <span className="text-xs text-on-surface-variant font-medium">
                  {safeIndex + 1} / {receiptsList.length}
                </span>
              )}
            </div>

            {receiptsList.length > 0 ? (
              <>
                <div className="relative w-full h-[46vh] lg:h-full lg:min-h-[380px] lg:flex-1 rounded-lg border border-outline-variant bg-zinc-950/90 overflow-hidden shadow-inner">
                  {isPdf ? (
                    <iframe
                      src={currentUrl}
                      title={currentReceipt?.file_name || 'Receipt PDF'}
                      className="w-full h-full border-0"
                    />
                  ) : (
                    <ZoomableImage
                      key={`${currentUrl}-${safeIndex}`}
                      src={currentUrl}
                      alt={currentReceipt?.file_name || 'Expense Receipt Preview'}
                      rotation={rotation}
                      containerClassName="w-full h-full"
                      className="max-w-full max-h-full w-auto h-auto object-contain p-2"
                    />
                  )}

                  {/* Top-Right Action Controls */}
                  <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
                    {!isPdf && (
                      <button
                        type="button"
                        onClick={() => setRotation((r) => (r + 90) % 360)}
                        className="bg-black/70 hover:bg-black/90 backdrop-blur-md p-1.5 rounded-lg text-white border border-white/20 cursor-pointer transition-colors"
                        title="Rotate 90°"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!currentUrl) return;
                        if (setPreviewMediaUrl) {
                          setPreviewMediaUrl({
                            url: currentUrl,
                            title:
                              currentReceipt?.file_name ||
                              `Expense #${expense.expense_id} Receipt`,
                          });
                        } else {
                          window.open(currentUrl, '_blank', 'noopener,noreferrer');
                        }
                      }}
                      className="bg-black/70 hover:bg-black/90 backdrop-blur-md px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white flex items-center gap-1.5 shadow-md border border-white/20 cursor-pointer transition-colors"
                      title="View Fullscreen Lightbox"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Fullscreen</span>
                    </button>
                  </div>

                  {/* Multi-receipt Prev / Next Buttons */}
                  {receiptsList.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveIndex(
                            (prev) => (prev - 1 + receiptsList.length) % receiptsList.length
                          );
                          setRotation(0);
                        }}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/65 hover:bg-black/90 text-white border border-white/20 cursor-pointer transition-colors"
                        aria-label="Previous receipt"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveIndex((prev) => (prev + 1) % receiptsList.length);
                          setRotation(0);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full bg-black/65 hover:bg-black/90 text-white border border-white/20 cursor-pointer transition-colors"
                        aria-label="Next receipt"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {/* File Name Pill */}
                  <div className="absolute bottom-2.5 right-2.5 bg-black/75 backdrop-blur-md px-2.5 py-0.5 rounded text-[10px] font-medium text-white flex items-center gap-1 shadow-md z-10 pointer-events-none max-w-[45%] truncate">
                    <Paperclip className="w-3 h-3 text-primary shrink-0" />
                    <span className="truncate">
                      {currentReceipt?.file_name ||
                        `Receipt ${(currentReceipt as any)?.media_id || ''}`}
                    </span>
                  </div>
                </div>

                {/* Thumbnail Ribbon Selector */}
                {receiptsList.length > 1 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 shrink-0 scrollbar-thin">
                    {receiptsList.map((m, idx) => {
                      const thumbUrl = resolveReceiptUrl(m);
                      return (
                        <button
                          key={(m as any).media_id ?? `thumb-${idx}`}
                          type="button"
                          onClick={() => {
                            setActiveIndex(idx);
                            setRotation(0);
                          }}
                          className={`relative w-16 h-16 rounded border-2 overflow-hidden cursor-pointer transition-all shrink-0 bg-black/20 ${
                            idx === safeIndex
                              ? 'border-primary ring-2 ring-primary/30'
                              : 'border-outline-variant opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img
                            src={thumbUrl}
                            alt={m.file_name || 'Thumbnail'}
                            className="w-full h-full object-cover"
                          />
                          {idx === safeIndex && (
                            <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-2xs">
                              <Check className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 min-h-[240px] p-8 rounded-lg border border-dashed border-outline-variant/80 bg-surface-container flex flex-col items-center justify-center text-center space-y-2">
                <Receipt className="w-10 h-10 text-on-surface-variant/40" />
                <p className="text-xs text-on-surface-variant font-medium">
                  No receipt images or media attachments uploaded for this expense.
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Expense & Linked Ticket Details */}
          <div className="lg:col-span-5 lg:overflow-y-auto overscroll-contain p-4 space-y-3.5 scrollbar-thin">
            {/* Summary Banner */}
            <div className="p-3.5 rounded-lg bg-surface-container-low border border-outline-variant/80 space-y-3 text-xs">
              <div className="flex items-baseline justify-between border-b border-outline-variant/60 pb-2.5">
                <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
                  Total Amount
                </span>
                <span className="text-xl font-extrabold text-primary tabular-nums">
                  KD {parseFloat(expense.amount || '0').toFixed(3)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider block">
                    Expense Date
                  </span>
                  <span className="font-semibold text-on-surface block mt-0.5">
                    {formatDateDMY(expense.expense_date) || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider block">
                    Worker / Technician
                  </span>
                  <span
                    className="font-semibold text-on-surface block mt-0.5 truncate"
                    title={workerDisplayName}
                  >
                    {workerDisplayName}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider block">
                    Responsible Store
                  </span>
                  <span
                    className="font-semibold text-on-surface block mt-0.5 truncate"
                    title={storeDisplayName}
                  >
                    {storeDisplayName}
                  </span>
                </div>
              </div>
            </div>

            {/* Remarks */}
            <div className="p-3.5 rounded-lg bg-surface-container-low border border-outline-variant/80 space-y-1.5 text-xs">
              <span className="text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider block">
                Expense Remarks / Description
              </span>
              <p className="text-on-surface text-xs leading-relaxed bg-surface-container p-2.5 rounded border border-outline-variant/60 whitespace-pre-wrap">
                {remarksText || 'No remarks recorded.'}
              </p>
            </div>

            {/* Linked Ticket Details */}
            {ticketInfo ? (
              <div className="p-3.5 rounded-lg bg-surface-container-low border border-primary/30 space-y-2.5 text-xs">
                <div className="flex items-center justify-between border-b border-outline-variant/60 pb-2">
                  <span className="text-xs font-bold text-primary tracking-wider flex items-center gap-1.5">
                    <FileText className="w-4 h-4" />
                    <span>Linked Ticket</span>
                  </span>
                  {ticketInfo.id && (
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedTicketForModal && setSelectedTicketForModal(rawTicket)
                      }
                      className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold text-[11px] border border-primary/20 hover:bg-primary/20 cursor-pointer"
                    >
                      Ticket #{ticketInfo.id}
                    </button>
                  )}
                </div>

                {ticketInfo.workOrderNo && (
                  <div className="flex items-center justify-between">
                    <span className="text-on-surface-variant font-medium">Work Order:</span>
                    <span className="font-bold text-on-surface font-mono">
                      {ticketInfo.workOrderNo}
                    </span>
                  </div>
                )}

                {ticketInfo.title && (
                  <div>
                    <span className="text-on-surface-variant text-[10px] font-semibold block uppercase">
                      Ticket Title
                    </span>
                    <p className="font-semibold text-on-surface mt-0.5">{ticketInfo.title}</p>
                  </div>
                )}

                {ticketInfo.description && (
                  <div>
                    <span className="text-on-surface-variant text-[10px] font-semibold block uppercase">
                      Description
                    </span>
                    <p className="text-on-surface-variant mt-0.5 leading-relaxed bg-surface-container p-2.5 rounded border border-outline-variant/80">
                      {ticketInfo.description}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-outline-variant/40">
                  {ticketInfo.status && (
                    <div>
                      <span className="text-[10px] text-on-surface-variant block">Status</span>
                      <span className="font-semibold text-on-surface block">
                        {ticketInfo.status}
                      </span>
                    </div>
                  )}
                  {ticketInfo.priority && (
                    <div>
                      <span className="text-[10px] text-on-surface-variant block">Priority</span>
                      <span className="font-semibold text-on-surface block">
                        {ticketInfo.priority}
                      </span>
                    </div>
                  )}
                  {ticketInfo.department && (
                    <div>
                      <span className="text-[10px] text-on-surface-variant block">Department</span>
                      <span className="font-semibold text-on-surface block">
                        {ticketInfo.department}
                      </span>
                    </div>
                  )}
                  {ticketInfo.location && (
                    <div>
                      <span className="text-[10px] text-on-surface-variant block">Location</span>
                      <span className="font-semibold text-on-surface block">
                        {ticketInfo.location}
                      </span>
                    </div>
                  )}
                  {ticketInfo.store && (
                    <div>
                      <span className="text-[10px] text-on-surface-variant block">Store</span>
                      <span className="font-semibold text-on-surface block">
                        {ticketInfo.store}
                      </span>
                    </div>
                  )}
                  {ticketInfo.createdDate && (
                    <div>
                      <span className="text-[10px] text-on-surface-variant block">
                        Created Date
                      </span>
                      <span className="font-semibold text-on-surface block">
                        {ticketInfo.createdDate}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-surface-container-low border border-outline-variant/80 text-xs text-on-surface-variant italic">
                No ticket linked to this expense.
              </div>
            )}
          </div>
        </div>

        {/* Pinned Footer */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-t border-outline-variant/80 bg-surface-container-low shrink-0">
          <span className="text-[11px] text-on-surface-variant hidden sm:inline">
            Scroll or double-click image to zoom • Drag image to move
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-5 py-2 rounded-lg border border-outline-variant text-xs text-on-surface hover:bg-surface-container-high transition-colors font-semibold cursor-pointer"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExpensePreviewModal;
