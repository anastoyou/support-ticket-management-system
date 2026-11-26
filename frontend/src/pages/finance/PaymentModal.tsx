import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Banknote,
  Loader2,
  AlertCircle,
  Package,
  Layers,
  Lock,
  User,
  UserCheck,
  ShieldCheck,
  ZoomIn,
  Calendar,
  Receipt,
  Printer,
  Download,
  Upload,
  Camera,
  CheckCircle2,
  Trash2,
} from 'lucide-react';
import type { PaymentItem, WorkerClaimItem, LedgerItem } from './types';
import { formatDateDMY } from './types';
import { getMediaUrl } from '../ticket/TicketsTypesAndComponents';
import { LiveCameraModal } from '@/components/LiveCameraModal';
import { ZoomableLightbox } from '@/components/ZoomableImage';
import {
  buildPaymentSlipDetails,
  downloadPaymentSlipPdf,
  printPaymentSlip,
} from './PaymentSlip';

interface PaymentModalProps {
  showPaymentModal: PaymentItem | WorkerClaimItem | LedgerItem | null;
  setShowPaymentModal: (item: PaymentItem | WorkerClaimItem | LedgerItem | null) => void;
  paymentRemarks: string;
  setPaymentRemarks: (rem: string) => void;
  paymentRecipient: string;
  setPaymentRecipient: (rec: string) => void;
  handleProcessPayment: (receiptFile?: File | null) => Promise<void>;
  submitting: boolean;
  errorMessage?: string | null;
}

const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i;

export const PaymentModal: React.FC<PaymentModalProps> = ({
  showPaymentModal,
  setShowPaymentModal,
  paymentRemarks,
  setPaymentRemarks,
  paymentRecipient,
  setPaymentRecipient,
  handleProcessPayment,
  submitting,
  errorMessage,
}) => {
  const [showPhotoZoom, setShowPhotoZoom] = useState(false);
  const [imgError, setImgError] = useState(false);

  const [printingSlip, setPrintingSlip] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [slipActionError, setSlipActionError] = useState<string | null>(null);

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [showReceiptZoom, setShowReceiptZoom] = useState(false);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const receiptPreviewUrl = useMemo(() => {
    if (!receiptFile) return null;
    return URL.createObjectURL(receiptFile);
  }, [receiptFile]);

  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) {
        URL.revokeObjectURL(receiptPreviewUrl);
      }
    };
  }, [receiptPreviewUrl]);

  // Reset local state when target modal changes
  useEffect(() => {
    setImgError(false);
    setShowPhotoZoom(false);
    setReceiptFile(null);
    setReceiptError(null);
    setShowReceiptZoom(false);
    setSlipActionError(null);
    setIsCameraModalOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }, [showPaymentModal]);

  const isClaim = Boolean(showPaymentModal && 'claim_id' in showPaymentModal);
  const isLedger = Boolean(showPaymentModal && 'ledger_id' in showPaymentModal && !isClaim);

  const claimItem = isClaim ? (showPaymentModal as WorkerClaimItem) : null;
  const ledgerItem = isLedger ? (showPaymentModal as LedgerItem) : null;

  // Automatically initialize default recipient whenever target changes
  useEffect(() => {
    if (!showPaymentModal) return;
    if ('claim_id' in showPaymentModal) {
      const claim = showPaymentModal as WorkerClaimItem;
      const defaultName =
        claim.worker_detail?.full_name ||
        claim.worker_detail?.username ||
        (claim as any).worker_name ||
        '';
      setPaymentRecipient(defaultName);
    } else if ('ledger_id' in showPaymentModal) {
      const ledger = showPaymentModal as LedgerItem;
      const defaultName =
        ledger.ledger_group_detail?.recipient_name ||
        (ledger as any).created_by_detail?.full_name ||
        (ledger as any).created_by_detail?.username ||
        (ledger as any).created_by_name ||
        '';
      setPaymentRecipient(defaultName);
    }
  }, [showPaymentModal, setPaymentRecipient]);

  const slipDetails = useMemo(() => {
    if (!showPaymentModal) return null;
    return buildPaymentSlipDetails({
      item: showPaymentModal,
      paymentRecipient,
      paymentRemarks,
    });
  }, [showPaymentModal, paymentRecipient, paymentRemarks]);

  if (!showPaymentModal || !slipDetails) return null;

  const targetAmount = parseFloat(
    (isClaim
      ? claimItem?.total_claimed_amount
      : isLedger
        ? ledgerItem?.total_amount
        : (showPaymentModal as PaymentItem)?.amount_paid) || '0'
  );

  // Extract worker object and details for identity verification
  const workerObj =
    claimItem?.worker_detail ||
    (typeof (claimItem as any)?.worker === 'object' ? (claimItem as any)?.worker : null) ||
    (claimItem?.expenses && claimItem.expenses[0]?.worker_detail) ||
    null;

  const rawWorkerImage =
    workerObj?.profile_image ||
    (claimItem as any)?.profile_image ||
    (claimItem as any)?.worker_profile_image ||
    (claimItem?.expenses && (claimItem.expenses[0] as any)?.profile_image) ||
    null;

  const workerImage = rawWorkerImage && !imgError ? getMediaUrl(rawWorkerImage) : null;

  const workerName =
    workerObj?.full_name ||
    workerObj?.username ||
    (claimItem as any)?.worker_name ||
    'Worker';

  const workerEmpNo =
    workerObj?.employee_no ||
    (claimItem as any)?.employee_no ||
    '';

  const workerSubDept =
    workerObj?.sub_departments?.[0]?.sub_department_name ||
    (workerObj?.sub_departments?.[0] as any)?.name ||
    (claimItem as any)?.ticket_details?.sub_department_name ||
    '';

  const handleClose = () => {
    if (submitting) return;
    setPaymentRemarks('');
    setPaymentRecipient('');
    setReceiptFile(null);
    setReceiptError(null);
    setIsCameraModalOpen(false);
    setShowPaymentModal(null);
  };

  const handleReceiptSelected = (file: File | null | undefined) => {
    if (!file) return;
    const isImageFile =
      (file.type && file.type.startsWith('image/')) ||
      IMAGE_EXT_REGEX.test(file.name || '');

    if (!isImageFile) {
      setReceiptError('Please upload a valid image file (JPG, PNG, WEBP, etc.).');
      return;
    }
    setReceiptError(null);
    setReceiptFile(file);
  };

  const handleClearReceipt = () => {
    setReceiptFile(null);
    setReceiptError(null);
    setShowReceiptZoom(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleOpenLiveCamera = () => {
    // Prefer in-browser LiveCameraModal on mobile & desktop so mobile OS does not
    // suspend/reload the browser tab when handing off to an external camera app.
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      setIsCameraModalOpen(true);
    } else if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  const rawReceiptCandidate =
    (showPaymentModal as any)?.payment_receipt_image ||
    (showPaymentModal as any)?.receipt_image ||
    '';
  const existingReceiptRaw: string | null =
    typeof rawReceiptCandidate === 'string' && rawReceiptCandidate.trim()
      ? rawReceiptCandidate.trim()
      : null;

  const existingReceiptUrl = existingReceiptRaw ? getMediaUrl(existingReceiptRaw) : null;
  const activeReceiptPreviewUrl = receiptPreviewUrl || existingReceiptUrl;
  const isAlreadySettled = Boolean(
    (showPaymentModal as any)?.status === 'Paid' ||
    (showPaymentModal as any)?.is_paid
  );

  const handlePrintSlip = async () => {
    setSlipActionError(null);
    setPrintingSlip(true);
    try {
      await printPaymentSlip(slipDetails);
    } catch (err: any) {
      setSlipActionError(err?.message || 'Failed to open print dialog for the payment slip.');
    } finally {
      setPrintingSlip(false);
    }
  };

  const handleDownloadSlipPdf = async () => {
    setSlipActionError(null);
    setDownloadingPdf(true);
    try {
      await downloadPaymentSlipPdf(slipDetails);
    } catch (err: any) {
      setSlipActionError(err?.message || 'Failed to generate 1/2 A4 Payment Slip PDF.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const canConfirmSettlement =
    !isAlreadySettled && Boolean(!submitting && paymentRecipient.trim() && receiptFile);

  const hasUploadedBillSide = Boolean(activeReceiptPreviewUrl);

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
        <div
          className={`bg-surface-container rounded border border-outline-variant w-full p-4 sm:p-6 space-y-3 sm:space-y-4 shadow-2xl animate-in fade-in-50 zoom-in-95 duration-150 sm:my-auto max-h-[92dvh] overflow-y-auto scrollbar-thin ${hasUploadedBillSide ? 'max-w-5xl' : 'max-w-2xl'
            }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant pb-2.5 sm:pb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/25 shrink-0">
                <Banknote className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-on-surface truncate">
                  {isClaim
                    ? `Cash Settlement • Bundle #${claimItem?.claim_id}`
                    : isLedger
                      ? `Cash Settlement • Ledger #${ledgerItem?.ledger_id}`
                      : `Cash Settlement`}
                </h3>
                <p className="text-[11px] text-on-surface-variant font-medium hidden sm:block">
                  {isClaim
                    ? 'Disburse full cash settlement for this approved worker claim bundle'
                    : isLedger
                      ? 'Disburse full cash settlement for this approved ledger and its attached bundles'
                      : 'Record cash settlement'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="p-2 sm:p-1.5 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            className={
              hasUploadedBillSide
                ? 'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start'
                : 'space-y-3 sm:space-y-4'
            }
          >
            <div className="space-y-3 sm:space-y-4 min-w-0">
              {/* 1. WORKER VERIFICATION & AMOUNT SUMMARY */}
              {isClaim && (
                <div className="p-3 sm:p-4 rounded bg-gradient-to-br from-teal-500/10 via-surface-container-low to-surface-container-low border border-teal-500/40 dark:border-teal-400/30 space-y-2.5 sm:space-y-3 shadow-xs">
                  <div className="hidden sm:flex items-center justify-between pb-2 border-b border-teal-500/20">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">
                      <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span className="uppercase tracking-wider text-[11px]">Worker Verification</span>
                    </div>
                  </div>

                  <div className="flex flex-row items-center sm:items-start gap-3 sm:gap-4">
                    {/* WORKER PHOTO */}
                    <div className="relative group shrink-0">
                      {workerImage ? (
                        <div
                          onClick={() => setShowPhotoZoom(true)}
                          className="relative w-16 h-16 sm:w-28 sm:h-28 rounded overflow-hidden border-2 border-teal-500 dark:border-teal-400 shadow-sm cursor-pointer group bg-surface-container-high transition-transform duration-150 hover:scale-[1.02]"
                          title="Click to inspect large photo"
                        >
                          <img
                            src={workerImage}
                            alt={workerName}
                            className="w-full h-full object-cover"
                            onError={() => setImgError(true)}
                          />
                          <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-semibold gap-1">
                            <ZoomIn className="w-5 h-5" />
                            <span className="hidden sm:inline">Enlarge Photo</span>
                          </div>
                        </div>
                      ) : (
                        <div className="w-16 h-16 sm:w-28 sm:h-28 rounded bg-surface-container border-2 border-dashed border-outline-variant flex flex-col items-center justify-center text-on-surface-variant gap-1 p-1.5 text-center shadow-xs">
                          <User className="w-6 h-6 sm:w-9 sm:h-9 opacity-40 text-on-surface-variant" />
                          <span className="text-[9px] sm:text-[10px] font-medium leading-tight">No Photo</span>
                        </div>
                      )}
                    </div>

                    {/* Worker Identity Details */}
                    <div className="flex-1 min-w-0 text-left space-y-1 sm:space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm sm:text-lg font-bold sm:font-black text-on-surface truncate" title={workerName}>
                          {workerName}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {workerEmpNo && (
                          <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 rounded bg-surface-container-high border border-outline-variant text-on-surface font-mono">
                            <span>ID:</span>
                            <span className="text-primary">{workerEmpNo}</span>
                          </span>
                        )}
                        {workerSubDept && (
                          <span className="inline-flex items-center text-[10px] sm:text-[11px] font-medium px-1.5 sm:px-2 py-0.5 rounded bg-surface-container border border-outline-variant text-on-surface-variant truncate max-w-[160px]">
                            {workerSubDept}
                          </span>
                        )}
                        <span className="sm:hidden text-[10px] text-on-surface-variant font-medium">
                          {claimItem?.expenses?.length || 0} exp • {formatDateDMY(claimItem?.claim_date) || slipDetails.dateStr}
                        </span>
                        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                          <Package className="w-3 h-3" />
                          <span>Bundle #{claimItem?.claim_id}</span>
                        </span>
                      </div>

                      <div className="pt-1.5 sm:pt-2 border-t border-teal-500/20 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-on-surface-variant">
                          Handover Cash
                        </span>
                        <span className="text-base sm:text-lg font-black text-teal-600 dark:text-teal-400">
                          KD {targetAmount.toFixed(3)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Target Details Summary Box (Always shown for Ledger/Payment; desktop-only for Claim to keep mobile compact) */}
              <div className={`${isClaim ? 'hidden sm:block' : 'block'} p-3 sm:p-3.5 rounded bg-surface-container-low border border-outline-variant/80 space-y-2.5`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {isClaim ? (
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                        <Package className="w-3.5 h-3.5" />
                        <span>Bundle {claimItem?.claim_id}</span>
                      </div>
                    ) : isLedger ? (
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 min-w-0">
                        <Layers className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{ledgerItem?.ledger_group_detail?.group_name || `Ledger #${ledgerItem?.ledger_id}`}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-on-surface-variant uppercase font-medium hidden sm:inline">Settlement Amount: </span>
                    <span className="text-sm font-extrabold text-teal-600 dark:text-teal-400">
                      KD {targetAmount.toFixed(3)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-outline-variant/60 text-xs">
                  {isClaim && (
                    <>
                      <div>
                        <div className="text-[10px] text-on-surface-variant font-medium">Worker</div>
                        <div className="text-xs font-bold text-on-surface truncate">
                          {workerName}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-on-surface-variant font-medium">Claim Date</div>
                        <div className="text-xs font-semibold text-on-surface flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-on-surface-variant opacity-70" />
                          <span>{formatDateDMY(claimItem?.claim_date) || slipDetails.dateStr}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-on-surface-variant font-medium">Expenses</div>
                        <div className="text-xs font-semibold text-on-surface flex items-center gap-1">
                          <Receipt className="w-3 h-3 text-on-surface-variant opacity-70" />
                          <span>{claimItem?.expenses?.length || 0} exp</span>
                        </div>
                      </div>
                    </>
                  )}

                  {isLedger && (
                    <>
                      <div>
                        <div className="text-[10px] text-on-surface-variant font-medium">Group</div>
                        <div className="text-xs font-bold text-on-surface truncate">
                          {ledgerItem?.ledger_group_detail?.group_name || 'Independent'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-on-surface-variant font-medium">Bundles</div>
                        <div className="text-xs font-semibold text-on-surface">
                          {ledgerItem?.bundles?.length || 0} bundles
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-on-surface-variant font-medium">Expenses</div>
                        <div className="text-xs font-semibold text-on-surface">
                          {ledgerItem?.expenses?.length || 0} exp
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Form Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-xs">
                <div className={isClaim ? 'hidden sm:block' : 'block'}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-on-surface">
                      Recipient Name <span className="text-rose-500">*</span>
                    </label>
                    <span className="text-[10px] text-on-surface-variant">Must match official ID</span>
                  </div>
                  <input
                    type="text"
                    disabled
                    required
                    placeholder="Enter receiver / technician / site engineer name..."
                    value={paymentRecipient}
                    onChange={(e) => setPaymentRecipient(e.target.value)}
                    className="w-full bg-surface-container-low border border-outline text-on-surface rounded p-2.5 text-sm sm:text-xs focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none"
                  />
                </div>

                <div className="hidden sm:block">
                  <label className="block font-semibold text-on-surface mb-1">
                    Amount to Hand Over
                  </label>
                  <div className="flex items-center justify-between p-2.5 rounded bg-surface-container-low border border-outline text-xs select-none">
                    <span className="font-extrabold text-teal-600 dark:text-teal-400 text-sm">
                      KD {targetAmount.toFixed(3)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-slate-500/10 text-on-surface-variant font-semibold border border-outline-variant">
                      <Lock className="w-2.5 h-2.5" />
                      <span>Fixed Settlement</span>
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-semibold text-on-surface mb-1">
                    Remarks <span className="text-[10px] font-normal text-on-surface-variant">(Optional)</span>
                  </label>
                  <textarea
                    value={paymentRemarks}
                    onChange={(e) => setPaymentRemarks(e.target.value)}
                    disabled={submitting || isAlreadySettled}
                    placeholder="Handover remarks (optional)..."
                    className="w-full bg-surface-container-low border border-outline text-on-surface rounded p-2.5 text-sm sm:text-xs focus:ring-1 focus:ring-teal-500 focus:border-teal-500 outline-none h-11 sm:h-14 resize-none disabled:opacity-75"
                  />
                </div>
              </div>

              {/* 2. PAYMENT SLIP (1/2 A4) — NO PREVIEW */}
              <div className="p-3 rounded border border-outline-variant bg-surface-container-low flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                <div className="flex items-center justify-between sm:block">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-on-surface">
                    <Receipt className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                    <span>Payment Slip</span>
                  </div>
                  <p className="text-[10px] text-on-surface-variant sm:mt-0.5">
                    1/2 A4 • Signatures blank
                  </p>
                </div>

                <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleDownloadSlipPdf}
                    disabled={downloadingPdf || printingSlip}
                    className="h-10 sm:h-auto px-3 sm:py-1.5 rounded bg-rose-700 hover:bg-rose-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                    title="Download 1/2 A4 Payment Slip as PDF"
                  >
                    {downloadingPdf ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>{downloadingPdf ? 'Saving...' : 'PDF'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintSlip}
                    disabled={printingSlip || downloadingPdf}
                    className="h-10 sm:h-auto px-3 sm:py-1.5 rounded bg-primary hover:bg-primary/90 text-on-primary text-xs font-semibold inline-flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition-colors disabled:opacity-50"
                    title="Print 1/2 A4 Payment Slip"
                  >
                    {printingSlip ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Printer className="w-3.5 h-3.5" />
                    )}
                    <span>{printingSlip ? 'Printing...' : 'Print Slip'}</span>
                  </button>
                </div>

                {slipActionError && (
                  <div className="w-full p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-[11px] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{slipActionError}</span>
                  </div>
                )}
              </div>


              {/* Error message */}
              {errorMessage && (
                <div className="p-3 rounded bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </div>

            {hasUploadedBillSide && activeReceiptPreviewUrl && (
              <img
                src={activeReceiptPreviewUrl}
                alt="Uploaded receipt"
                onClick={() => setShowReceiptZoom(true)}
                title="Click to zoom / print"
                className="w-full max-h-[420px] object-contain rounded border border-outline-variant cursor-pointer md:sticky md:top-0"
              />
            )}
          </div>

          {/* Actions (Sticky bottom bar on mobile for single-thumb confirmation) */}
          <div className="sticky -bottom-4 sm:static bg-surface-container -mx-4 px-4 py-3 sm:mx-0 sm:px-0 sm:pt-3 sm:pb-0 border-t border-outline-variant flex items-center justify-end gap-2 sm:gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="px-4 h-11 sm:h-auto sm:py-2 rounded border border-outline text-xs font-semibold text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer disabled:opacity-50 shrink-0"
            >
              {isAlreadySettled ? 'Close' : 'Cancel'}
            </button>
            {isAlreadySettled ? (
              <span className="px-4 h-11 sm:h-auto sm:py-2 rounded bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30 text-xs font-semibold inline-flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span>Settled (KD {targetAmount.toFixed(3)})</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!receiptFile) return;
                  handleProcessPayment(receiptFile);
                }}
                disabled={!canConfirmSettlement}
                title={
                  !receiptFile
                    ? 'Please upload the signed payment receipt image first'
                    : 'Confirm Cash Settlement'
                }
                className="flex-1 sm:flex-none px-4 h-11 sm:h-auto sm:py-2 rounded bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-sm hover:shadow cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Settling...</span>
                  </>
                ) : (
                  <>
                    <Banknote className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    <span>Confirm Settlement (KD {targetAmount.toFixed(3)})</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* LIVE CAMERA MODAL (In-tab live camera on mobile & desktop, with device fallback) */}
      <LiveCameraModal
        isOpen={isCameraModalOpen}
        initialMode="photo"
        photoOnly={true}
        onNativeFallback={() => cameraInputRef.current?.click()}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={(capturedFile) => {
          handleReceiptSelected(capturedFile);
          setIsCameraModalOpen(false);
        }}
      />

      {/* ENLARGED WORKER PHOTO LIGHTBOX MODAL */}
      {showPhotoZoom && workerImage && (
        <div
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-50 duration-150"
          onClick={() => setShowPhotoZoom(false)}
        >
          <div
            className="bg-surface-container rounded border border-outline-variant max-w-sm w-full p-4 space-y-3 shadow-2xl relative animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span className="text-xs font-bold text-on-surface">{workerName}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowPhotoZoom(false)}
                className="p-1 rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="w-full aspect-square rounded overflow-hidden bg-black/20 border border-outline-variant flex items-center justify-center">
              <img
                src={workerImage}
                alt={workerName}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="text-center pt-1 space-y-0.5">
              <p className="text-xs font-bold text-on-surface">{workerName}</p>
              <p className="text-[11px] text-teal-600 dark:text-teal-400 font-bold pt-1">
                Cash Settlement: KD {targetAmount.toFixed(3)}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowPhotoZoom(false)}
              className="w-full py-2 rounded bg-surface-container-high hover:bg-surface-container-highest text-xs font-semibold text-on-surface transition-colors cursor-pointer"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}

      {/* ENLARGED UPLOADED RECEIPT LIGHTBOX */}
      <ZoomableLightbox
        media={
          showReceiptZoom && activeReceiptPreviewUrl
            ? {
              url: activeReceiptPreviewUrl,
              title: receiptFile?.name || `Signed Settlement Receipt • ${slipDetails.serialNo}`,
            }
            : null
        }
        onClose={() => setShowReceiptZoom(false)}
        zIndexClass="z-[70]"
      />
    </>
  );
};
