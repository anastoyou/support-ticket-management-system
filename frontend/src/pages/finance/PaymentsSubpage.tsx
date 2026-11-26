import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck, X, Eye } from 'lucide-react';
import type { PaymentItem, AuditEventItem, WorkerClaimItem, LedgerItem } from './types';
import { Pagination } from './Pagination';
import { SearchableSelect, type SelectOption } from '../../components/SearchableSelect';
import { getMediaUrl } from '../ticket/TicketsTypesAndComponents';

interface PaymentsSubpageProps {
  filteredPayments: PaymentItem[];
  payments: PaymentItem[];
  auditEvents: AuditEventItem[];
  showPaymentModal: PaymentItem | WorkerClaimItem | LedgerItem | null;
  setShowPaymentModal: (item: PaymentItem | WorkerClaimItem | LedgerItem | null) => void;
  paymentMethod: string;
  setPaymentMethod: (val: string) => void;
  paymentAmount: string;
  setPaymentAmount: (val: string) => void;
  paymentRef: string;
  setPaymentRef: (val: string) => void;
  paymentRemarks: string;
  setPaymentRemarks: (val: string) => void;
  handleProcessPayment: () => void;
  submitting: boolean;
  setPreviewMediaUrl?: (media: { url: string; title: string } | null) => void;
}

export const PaymentsSubpage: React.FC<PaymentsSubpageProps> = ({
  filteredPayments,
  payments,
  auditEvents,
  showPaymentModal,
  setShowPaymentModal,
  paymentMethod,
  setPaymentMethod,
  paymentAmount,
  setPaymentAmount,
  paymentRef,
  setPaymentRef,
  paymentRemarks,
  setPaymentRemarks,
  handleProcessPayment,
  submitting,
  setPreviewMediaUrl,
}) => {
  // Pagination State for Payments Table
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsPerPage, setPaymentsPerPage] = useState(10);

  // Pagination State for Audit Events Table
  const [auditsPage, setAuditsPage] = useState(1);
  const [auditsPerPage, setAuditsPerPage] = useState(10);

  useEffect(() => {
    setPaymentsPage(1);
  }, [filteredPayments.length]);

  useEffect(() => {
    setAuditsPage(1);
  }, [auditEvents.length]);

  const paginatedPayments = useMemo(() => {
    const start = (paymentsPage - 1) * paymentsPerPage;
    return filteredPayments.slice(start, start + paymentsPerPage);
  }, [filteredPayments, paymentsPage, paymentsPerPage]);

  const paginatedAudits = useMemo(() => {
    const start = (auditsPage - 1) * auditsPerPage;
    return auditEvents.slice(start, start + auditsPerPage);
  }, [auditEvents, auditsPage, auditsPerPage]);

  return (
    <div className="space-y-6">
      {/* Recorded Payments */}
      <div className="border border-outline-variant rounded overflow-hidden bg-surface-container flex flex-col">
        <div className="p-3 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
          <span className="text-xs font-semibold text-on-surface">Payment & Settlement Register</span>
          <span className="text-xs text-on-surface-variant font-medium">Showing {filteredPayments.length} of {payments.length}</span>
        </div>

        {filteredPayments.length === 0 ? (
          <div className="p-8 text-center text-xs text-on-surface-variant">No disbursement payments match filters.</div>
        ) : (
          <>
            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-outline-variant">
              {paginatedPayments.map((p) => {
                const receiptUrl = p.receipt_image ? getMediaUrl(p.receipt_image) : null;
                return (
                  <div key={`m_pay_${p.payment_id}`} className="p-3.5 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-primary">
                          {p.claim ? `Bundle #${p.claim}` : p.ledger ? `Ledger #${p.ledger}` : 'Expense'}
                        </span>
                        <span className="text-[11px] text-on-surface-variant block mt-0.5">
                          Payment #{p.payment_id} • {p.payment_method}
                        </span>
                      </div>
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm shrink-0">
                        KD {parseFloat(p.amount_paid).toFixed(3)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-on-surface-variant gap-2">
                      <span className="truncate">By {p.paid_by_username || 'System'}</span>
                      <span className="shrink-0">{new Date(p.paid_at).toLocaleDateString()}</span>
                    </div>
                    {receiptUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          if (setPreviewMediaUrl) {
                            setPreviewMediaUrl({
                              url: receiptUrl,
                              title: `Payment Receipt #${p.payment_id}${p.claim ? ` (Bundle #${p.claim})` : ''}`,
                            });
                          } else {
                            window.open(receiptUrl, '_blank', 'noopener,noreferrer');
                          }
                        }}
                        className="w-full py-2 rounded bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/30 text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Receipt</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto flex-1">
              <table className="w-full text-xs text-left text-on-surface">
                <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[10px] tracking-wider border-b border-outline-variant">
                  <tr>
                    <th className="px-4 py-3">Payment ID</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Reference</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3 text-right">Amount (KD)</th>
                    <th className="px-4 py-3">Disbursed By</th>
                    <th className="px-4 py-3">Receipt</th>
                    <th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {paginatedPayments.map((p) => {
                    const receiptUrl = p.receipt_image ? getMediaUrl(p.receipt_image) : null;
                    return (
                    <tr key={p.payment_id} className="hover:bg-surface-container-high transition-colors">
                      <td className="px-4 py-3  font-medium">{p.payment_id}</td>
                      <td className="px-4 py-3 font-medium">{p.payment_method}</td>
                      <td className="px-4 py-3  text-[11px] text-on-surface-variant">{p.transaction_reference || '-'}</td>
                      <td className="px-4 py-3  text-primary font-medium">
                        {p.claim ? `Bundle ${p.claim}` : p.ledger ? `Ledger ${p.ledger}` : 'Expense'}
                      </td>
                      <td className="px-4 py-3 text-right  font-semibold text-emerald-600 dark:text-emerald-400">
                        {parseFloat(p.amount_paid).toFixed(3)}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">{p.paid_by_username || 'System'}</td>
                      <td className="px-4 py-3">
                        {receiptUrl ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (setPreviewMediaUrl) {
                                setPreviewMediaUrl({
                                  url: receiptUrl,
                                  title: `Payment Receipt #${p.payment_id}${p.claim ? ` (Bundle #${p.claim})` : ''}`,
                                });
                              } else {
                                window.open(receiptUrl, '_blank', 'noopener,noreferrer');
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/30 text-[11px] font-semibold cursor-pointer transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View Receipt</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-on-surface-variant/60">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">{new Date(p.paid_at).toLocaleString()}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={paymentsPage}
              totalItems={filteredPayments.length}
              itemsPerPage={paymentsPerPage}
              onPageChange={setPaymentsPage}
              onItemsPerPageChange={(num) => {
                setPaymentsPerPage(num);
                setPaymentsPage(1);
              }}
            />
          </>
        )}
      </div>

      {/* Immutable Audit Log */}
      <div className="border border-outline-variant rounded overflow-hidden bg-surface-container flex flex-col">
        <div className="p-3 bg-surface-container-low border-b border-outline-variant flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-on-surface">Immutable System Audit Trail</span>
          </div>
          <span className="text-[10px] text-on-surface-variant ">Read-Only Logs ({auditEvents.length})</span>
        </div>

        {auditEvents.length === 0 ? (
          <div className="p-8 text-center text-xs text-on-surface-variant">No audit events logged yet.</div>
        ) : (
          <>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-xs text-left text-on-surface">
                <thead className="bg-surface-container-low text-on-surface-variant uppercase text-[10px] tracking-wider border-b border-outline-variant">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Entity</th>
                    <th className="px-4 py-3">Entity ID</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant  text-[11px]">
                  {paginatedAudits.map((evt) => (
                    <tr key={evt.event_id} className="hover:bg-surface-container-high transition-colors">
                      <td className="px-4 py-3 text-on-surface-variant">{new Date(evt.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-3 font-semibold text-on-surface">{evt.entity_name}</td>
                      <td className="px-4 py-3">{evt.entity_id}</td>
                      <td className="px-4 py-3 text-primary font-semibold">{evt.action}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{evt.actor_username || 'System'}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{evt.ip_address || '127.0.0.1'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={auditsPage}
              totalItems={auditEvents.length}
              itemsPerPage={auditsPerPage}
              onPageChange={setAuditsPage}
              onItemsPerPageChange={(num) => {
                setAuditsPerPage(num);
                setAuditsPage(1);
              }}
            />
          </>
        )}
      </div>

    </div>
  );
};
