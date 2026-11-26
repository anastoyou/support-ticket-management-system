import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { LedgerItem, PaymentItem, WorkerClaimItem } from './types';
import { formatDateDMY } from './types';
import { getMediaUrl } from '../ticket/TicketsTypesAndComponents';

export interface PaymentSlipDetails {
  serialNo: string;
  fileTag: string;
  dateStr: string;
  divisions: string;
  headOfAccounts: string;
  recipientDisplay: string;
  kwdPart: string;
  filsPart: string;
  amountInWords: string;
  beingLine1: string;
  beingLine2: string;
  workerImageUrl?: string | null;
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

function integerToEnglishWords(num: number): string {
  if (!Number.isFinite(num) || num <= 0) return 'Zero';

  const belowThousand = (n: number): string => {
    const parts: string[] = [];
    if (n >= 100) {
      parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
      n %= 100;
    }
    if (n >= 20) {
      const tenWord = TENS[Math.floor(n / 10)];
      const oneWord = ONES[n % 10];
      parts.push(oneWord ? `${tenWord}-${oneWord}` : tenWord);
    } else if (n > 0) {
      parts.push(ONES[n]);
    }
    return parts.join(' ');
  };

  const scales: Array<{ value: number; label: string }> = [
    { value: 1_000_000_000, label: 'Billion' },
    { value: 1_000_000, label: 'Million' },
    { value: 1_000, label: 'Thousand' },
    { value: 1, label: '' },
  ];

  let remaining = Math.floor(num);
  const chunks: string[] = [];

  for (const scale of scales) {
    if (remaining >= scale.value) {
      const chunk = Math.floor(remaining / scale.value);
      remaining %= scale.value;
      const words = belowThousand(chunk);
      chunks.push(scale.label ? `${words} ${scale.label}` : words);
    }
  }

  return chunks.join(' ').trim();
}

export function numberToKwdWords(amount: number): string {
  const safeAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;
  const totalFils = Math.round(safeAmount * 1000);
  const dinars = Math.floor(totalFils / 1000);
  const fils = totalFils % 1000;

  if (dinars === 0 && fils === 0) {
    return 'Zero Kuwaiti Dinars Only';
  }

  const dinarLabel = dinars === 1 ? 'Kuwaiti Dinar' : 'Kuwaiti Dinars';
  if (dinars > 0 && fils > 0) {
    return `${integerToEnglishWords(dinars)} ${dinarLabel} and ${integerToEnglishWords(fils)} Fils Only`;
  }
  if (dinars > 0) {
    return `${integerToEnglishWords(dinars)} ${dinarLabel} Only`;
  }
  return `${integerToEnglishWords(fils)} Fils Only`;
}

function truncateText(text: string, maxLength: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function splitTwoLines(text: string, line1Max = 78, line2Max = 88): [string, string] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return ['', ''];
  if (cleaned.length <= line1Max) return [cleaned, ''];

  let splitIdx = cleaned.lastIndexOf(' ', line1Max);
  if (splitIdx < Math.floor(line1Max * 0.45)) {
    splitIdx = line1Max;
  }
  const line1 = cleaned.slice(0, splitIdx).trim();
  const rest = cleaned.slice(splitIdx).trim();
  const line2 = truncateText(rest, line2Max);
  return [line1, line2];
}

function addUnique(set: Set<string>, val?: string | null) {
  if (!val) return;
  const trimmed = String(val).trim();
  if (trimmed) set.add(trimmed);
}

export function buildPaymentSlipDetails(params: {
  item: PaymentItem | WorkerClaimItem | LedgerItem;
  paymentRecipient?: string;
  paymentRemarks?: string;
}): PaymentSlipDetails {
  const { item, paymentRecipient = '', paymentRemarks = '' } = params;
  const isClaim = 'claim_id' in item;
  const isLedger = 'ledger_id' in item && !isClaim;

  const claimItem = isClaim ? (item as WorkerClaimItem) : null;
  const ledgerItem = isLedger ? (item as LedgerItem) : null;

  const rawAmount = parseFloat(
    (isClaim
      ? claimItem?.total_claimed_amount
      : isLedger
        ? ledgerItem?.total_amount
        : (item as PaymentItem).amount_paid) || '0'
  );
  const safeAmount = Number.isFinite(rawAmount) ? rawAmount : 0;
  const [kwdPart, filsPart] = safeAmount.toFixed(3).split('.');

  const voucherDate = formatDateDMY(new Date().toISOString());

  const serialNo = isClaim && claimItem?.claim_id
    ? String(claimItem.claim_id).padStart(6, '0')
    : isLedger && ledgerItem?.ledger_id
      ? `L${String(ledgerItem.ledger_id).padStart(5, '0')}`
      : String((item as PaymentItem).payment_id || '000001').padStart(6, '0');

  const fileTag = isClaim && claimItem?.claim_id
    ? `Bundle_${claimItem.claim_id}`
    : isLedger && ledgerItem?.ledger_id
      ? `Ledger_${ledgerItem.ledger_id}`
      : `Payment_${(item as PaymentItem).payment_id || 'Slip'}`;

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

  const workerImageUrl = rawWorkerImage ? getMediaUrl(String(rawWorkerImage)) : null;

  const workerEmpNo =
    workerObj?.employee_no ||
    (claimItem as any)?.employee_no ||
    '';

  const baseRecipient =
    paymentRecipient.trim() ||
    workerObj?.full_name ||
    workerObj?.username ||
    (claimItem as any)?.worker_name ||
    ledgerItem?.ledger_group_detail?.recipient_name ||
    '';

  const recipientDisplay = workerEmpNo && baseRecipient && !baseRecipient.includes(workerEmpNo)
    ? `${baseRecipient} (${workerEmpNo})`
    : baseRecipient;

  const expenses = isClaim
    ? (claimItem?.expenses || [])
    : isLedger
      ? (ledgerItem?.expenses || [])
      : [];

  const departments = new Set<string>();
  const subDepartments = new Set<string>();
  const categories = new Set<string>();
  const stores = new Set<string>();

  addUnique(departments, claimItem?.ticket_details?.department_name);
  addUnique(subDepartments, claimItem?.ticket_details?.sub_department_name);
  addUnique(stores, claimItem?.ticket_details?.store_name);

  if (Array.isArray(workerObj?.sub_departments)) {
    workerObj.sub_departments.forEach((sd: any) => {
      addUnique(subDepartments, sd?.sub_department_name);
      addUnique(departments, sd?.department_name);
    });
  }

  const extraBatches = (claimItem as any)?.ledger_batches;
  if (Array.isArray(extraBatches)) {
    extraBatches.forEach((b: any) => addUnique(subDepartments, b?.batchName));
  }
  if (ledgerItem?.ledger_batch_detail?.batch_name) {
    addUnique(subDepartments, ledgerItem.ledger_batch_detail.batch_name);
  }

  expenses.forEach((exp: any) => {
    addUnique(departments, exp?.ticket_details?.department_name);
    addUnique(subDepartments, exp?.ticket_details?.sub_department_name || exp?.sub_department_name);
    addUnique(
      categories,
      exp?.expense_type_detail?.expense_name || exp?.expense_type?.expense_name
    );
    addUnique(stores, exp?.responsible_store?.store_name || exp?.ticket_details?.store_name);
  });

  const deptList = Array.from(departments);
  const subDeptList = Array.from(subDepartments);
  const divisionsRaw = deptList.length > 0 && subDeptList.length > 0
    ? `${deptList.join(', ')} — ${subDeptList.join(', ')}`
    : subDeptList.length > 0
      ? subDeptList.join(', ')
      : deptList.length > 0
        ? deptList.join(', ')
        : Array.from(stores)[0] || 'Maintenance Division';

  const ledgerGroupName =
    claimItem?.ledger_details?.group_name ||
    (claimItem as any)?.ledger_group_name ||
    ledgerItem?.ledger_group_detail?.group_name ||
    '';

  const catList = Array.from(categories);
  const headParts: string[] = ['Maintenance Expenses'];
  if (catList.length > 0) {
    headParts.push(catList.slice(0, 3).join(', ') + (catList.length > 3 ? ` (+${catList.length - 3})` : ''));
  }
  if (ledgerGroupName) {
    headParts.push(ledgerGroupName);
  }
  const headOfAccountsRaw = headParts.join(' | ');

  // Concise "Being" line — keep only the essential settlement description
  const remarksText =
    (paymentRemarks || '').trim() ||
    (claimItem?.remarks || '').trim() ||
    (ledgerItem?.remarks || '').trim();

  let beingText = isClaim && claimItem
    ? `Cash settlement for Bundle #${claimItem.claim_id}`
    : isLedger && ledgerItem
      ? `Cash settlement for Ledger #${ledgerItem.ledger_id}`
      : 'Cash settlement payment';

  if (ledgerGroupName) {
    beingText += ` (${ledgerGroupName})`;
  }
  if (remarksText) {
    beingText += ` — ${remarksText}`;
  }

  const [beingLine1, beingLine2] = splitTwoLines(beingText);

  return {
    serialNo,
    fileTag,
    dateStr: voucherDate,
    divisions: truncateText(divisionsRaw, 54),
    headOfAccounts: truncateText(headOfAccountsRaw, 56),
    recipientDisplay: truncateText(recipientDisplay, 72),
    kwdPart,
    filsPart,
    amountInWords: truncateText(numberToKwdWords(safeAmount), 84),
    beingLine1,
    beingLine2,
    workerImageUrl,
  };
}

const SLIP_RED = '#b41f24';
const VALUE_INK = '#111827';

let cachedLogoDataUri: string | null = null;
const cachedWorkerPhotoDataUris = new Map<string, string>();

async function fetchImageAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.toLowerCase().startsWith('image/')) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function resolveDocumentLogoSrc(): Promise<string> {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const candidates = Array.from(
    new Set([`${normalizedBase}document_logo.png`, '/document_logo.png'])
  );
  const fallback =
    typeof window !== 'undefined'
      ? `${window.location.origin}${candidates[0]}`
      : candidates[0];

  for (const url of candidates) {
    const dataUrl = await fetchImageAsDataUri(url);
    if (dataUrl) {
      cachedLogoDataUri = dataUrl;
      return dataUrl;
    }
  }
  return fallback;
}

async function resolveWorkerPhotoSrc(url?: string | null): Promise<string | null> {
  if (!url) return null;
  const cached = cachedWorkerPhotoDataUris.get(url);
  if (cached) return cached;
  const dataUrl = await fetchImageAsDataUri(url);
  const resolved = dataUrl || url;
  if (dataUrl) {
    cachedWorkerPhotoDataUris.set(url, dataUrl);
  }
  return resolved;
}

const DottedLineField: React.FC<{
  label?: string;
  value?: string;
}> = ({ label, value }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-end',
      width: '100%',
      minHeight: '22px',
      gap: '6px',
    }}
  >
    {label && (
      <span
        style={{
          color: SLIP_RED,
          fontSize: '11.5px',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          lineHeight: '1.2',
          paddingBottom: '1px',
        }}
      >
        {label}
      </span>
    )}
    <div
      style={{
        flex: 1,
        borderBottom: `1.5px dotted ${SLIP_RED}`,
        minHeight: '18px',
        padding: '0 6px 2px 6px',
        color: VALUE_INK,
        fontSize: '12px',
        fontWeight: 600,
        lineHeight: '1.25',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
      title={value || undefined}
    >
      {value || '\u00A0'}
    </div>
  </div>
);

const PaymentSlipSheet: React.FC<{
  details: PaymentSlipDetails;
  logoSrc: string;
  workerImageSrc?: string | null;
}> = ({ details, logoSrc, workerImageSrc }) => {
  return (
    <div
      className="payment-slip-sheet"
      style={{
        width: '794px',
        height: '559px',
        backgroundColor: '#ffffff',
        color: SLIP_RED,
        fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif',
        padding: '18px 28px 16px 28px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {/* 1. HEADER BOX */}
      <div
        style={{
          border: `1.6px solid ${SLIP_RED}`,
          borderRadius: '10px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        {/* Left: English Corporate Office */}
        <div
          style={{
            width: '33%',
            textAlign: 'left',
            color: SLIP_RED,
            lineHeight: 1.28,
          }}
        >
          <div style={{ fontSize: '16.5px', fontWeight: 800, marginBottom: '2px' }}>
            Grand Hyper
          </div>
          <div style={{ fontSize: '9.5px', fontWeight: 500 }}>Corporate Office</div>
          <div style={{ fontSize: '9.5px', fontWeight: 500 }}>4th Floor - Al Buraq Mall</div>
          <div style={{ fontSize: '9.5px', fontWeight: 500 }}>IBN Khaldoun St.</div>
          <div style={{ fontSize: '9.5px', fontWeight: 500 }}>Hawally, Kuwait</div>
          <div style={{ fontSize: '9.5px', fontWeight: 600 }}>Tel.: +965 22671551/2/3</div>
        </div>

        {/* Center: Document Logo + Bilingual Title */}
        <div
          style={{
            width: '34%',
            textAlign: 'center',
            color: SLIP_RED,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={logoSrc}
            alt="Grand Hyper"
            style={{
              height: '52px',
              width: 'auto',
              maxWidth: '130px',
              objectFit: 'contain',
              display: 'block',
              margin: '0 auto 2px auto',
            }}
          />
          <div
            style={{
              fontSize: '14.5px',
              fontWeight: 700,
              lineHeight: 1.2,
              direction: 'rtl',
            }}
          >
            سند دفع
          </div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 800,
              letterSpacing: '0.6px',
              lineHeight: 1.2,
              marginTop: '1px',
            }}
          >
            PAYMENT SLIP
          </div>
        </div>

        {/* Right: Worker Photo */}
        <div
          style={{
            width: '33%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          {workerImageSrc && (
            <img
              src={workerImageSrc}
              alt={details.recipientDisplay || 'Worker Photo'}
              style={{
                width: '82px',
                height: '82px',
                objectFit: 'cover',
                borderRadius: '6px',
                border: `1.5px solid ${SLIP_RED}`,
                display: 'block',
                backgroundColor: '#ffffff',
              }}
            />
          )}
        </div>
      </div>

      {/* 2. MIDDLE META & AMOUNT SECTION */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '24px',
          margin: '10px 0 8px 0',
        }}
      >
        {/* Left: Date / Divisions / Head of Accounts */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <DottedLineField label="Date" value={details.dateStr} />
          <DottedLineField label="Divisions" value={details.divisions} />
          <DottedLineField label="Head of Accounts" value={details.headOfAccounts} />
        </div>

        {/* Right: Serial No & KWD / Fils Box */}
        <div
          style={{
            width: '215px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'flex-end',
              gap: '6px',
              width: '100%',
            }}
          >
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: SLIP_RED }}>
              S.No.A-
            </span>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 700,
                letterSpacing: '1.2px',
                color: SLIP_RED,
                fontFamily: '"Courier New", Courier, monospace',
              }}
            >
              {details.serialNo}
            </span>
          </div>

          <div style={{ width: '100%' }}>
            <div
              style={{
                display: 'flex',
                width: '100%',
                fontSize: '10.5px',
                fontWeight: 700,
                color: SLIP_RED,
                marginBottom: '3px',
              }}
            >
              <div style={{ width: '62%', textAlign: 'center' }}>KWD.</div>
              <div style={{ width: '38%', textAlign: 'center' }}>Fils</div>
            </div>
            <div
              style={{
                display: 'flex',
                width: '100%',
                height: '34px',
                border: `1.6px solid ${SLIP_RED}`,
                backgroundColor: '#ffffff',
              }}
            >
              <div
                style={{
                  width: '62%',
                  borderRight: `1.6px solid ${SLIP_RED}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '15px',
                  fontWeight: 800,
                  color: VALUE_INK,
                }}
              >
                {details.kwdPart}
              </div>
              <div
                style={{
                  width: '38%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '15px',
                  fontWeight: 800,
                  color: VALUE_INK,
                }}
              >
                {details.filsPart}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. LOWER ROUNDED DETAILS BOX */}
      <div
        style={{
          border: `1.6px solid ${SLIP_RED}`,
          borderRadius: '10px',
          padding: '13px 16px 15px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '13px',
        }}
      >
        <DottedLineField
          label="Payments to Mr./M/s"
          value={details.recipientDisplay}
        />
        <DottedLineField label="The sum of" value={details.amountInWords} />
        <DottedLineField label="Being" value={details.beingLine1} />
        <DottedLineField value={details.beingLine2} />
      </div>

      {/* 4. BOTTOM SIGNATURE LINES (INTENTIONALLY LEFT BLANK) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '48px',
          paddingTop: '18px',
          paddingBottom: '2px',
        }}
      >
        <div style={{ flex: 1 }}>
          <DottedLineField label="Receiver's Sign" />
        </div>
        <div style={{ flex: 1 }}>
          <DottedLineField label="Accounts Dept" />
        </div>
      </div>
    </div>
  );
};

function buildPaymentSlipsHtml(
  slips: PaymentSlipDetails[],
  logoSrc: string,
  title: string,
  workerImages: Array<string | null> = []
): string {
  const pages: string[] = [];
  for (let i = 0; i < slips.length; i += 2) {
    const pair = slips.slice(i, i + 2);
    const slotsHtml = pair
      .map((slip, idx) => {
        const slipIdx = i + idx;
        const sheetMarkup = renderToStaticMarkup(
          <PaymentSlipSheet
            details={slip}
            logoSrc={logoSrc}
            workerImageSrc={workerImages[slipIdx] ?? slip.workerImageUrl}
          />
        );
        const slotClass =
          idx === 0 ? 'half-a4-slot half-a4-slot-top' : 'half-a4-slot';
        return `<div class="${slotClass}">${sheetMarkup}</div>`;
      })
      .join('');
    pages.push(`<div class="a4-pair-page">${slotsHtml}</div>`);
  }

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      @page {
        size: A4 portrait;
        margin: 0;
      }
      *, *::before, *::after {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .a4-pair-page {
        width: 210mm;
        height: 296mm;
        display: flex;
        flex-direction: column;
        margin: 0;
        padding: 0;
        overflow: hidden;
        page-break-after: always;
        break-after: page;
      }
      .a4-pair-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .half-a4-slot {
        width: 210mm;
        height: 148mm;
        overflow: hidden;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .half-a4-slot-top {
        border-bottom: 0.5pt dashed #cbd5e1;
      }
      .half-a4-slot > .payment-slip-sheet {
        width: 210mm !important;
        height: 148mm !important;
      }
    </style>
  </head>
  <body>
    ${pages.join('')}
  </body>
</html>`;
}

async function waitForImages(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images || []);
  if (imgs.length === 0) return;

  await Promise.race([
    Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          })
      )
    ),
    new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  ]);
}

async function printSlipsHtml(html: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '210mm';
  iframe.style.height = '296mm';
  iframe.style.border = 'none';
  iframe.style.zIndex = '-9999';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    if (document.body.contains(iframe)) document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  await waitForImages(doc);
  await new Promise((r) => setTimeout(r, 120));

  const cleanupIframe = () => {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  };

  try {
    win.addEventListener('afterprint', cleanupIframe, { once: true });
    win.focus();
    win.print();
  } catch (err) {
    console.error('Iframe print failed, falling back to popup:', err);
    const popup = window.open('', '_blank');
    if (popup) {
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      setTimeout(() => {
        popup.focus();
        popup.print();
      }, 300);
    }
  } finally {
    // Allow sufficient time for slower mobile/OS print dialogs if afterprint does not fire
    setTimeout(cleanupIframe, 60000);
  }
}

async function resolveSlipAssets(slips: PaymentSlipDetails[]): Promise<{
  logoSrc: string;
  workerImages: Array<string | null>;
}> {
  const [logoSrc, ...workerImages] = await Promise.all([
    resolveDocumentLogoSrc(),
    ...slips.map((s) => resolveWorkerPhotoSrc(s.workerImageUrl)),
  ]);
  return { logoSrc, workerImages };
}

export async function printPaymentSlip(details: PaymentSlipDetails): Promise<void> {
  const { logoSrc, workerImages } = await resolveSlipAssets([details]);
  const html = buildPaymentSlipsHtml(
    [details],
    logoSrc,
    `Payment Slip - ${details.fileTag}`,
    workerImages
  );
  await printSlipsHtml(html);
}

export async function printAllPaymentSlips(
  slips: PaymentSlipDetails[],
  groupTitle = 'Ledger Payment Slips'
): Promise<void> {
  if (!slips || slips.length === 0) return;
  const { logoSrc, workerImages } = await resolveSlipAssets(slips);
  const html = buildPaymentSlipsHtml(
    slips,
    logoSrc,
    `Payment Slips - ${groupTitle}`,
    workerImages
  );
  await printSlipsHtml(html);
}

export async function downloadPaymentSlipPdf(details: PaymentSlipDetails): Promise<void> {
  const { logoSrc, workerImages } = await resolveSlipAssets([details]);
  const sheetMarkup = renderToStaticMarkup(
    <PaymentSlipSheet
      details={details}
      logoSrc={logoSrc}
      workerImageSrc={workerImages[0] ?? details.workerImageUrl}
    />
  );
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #ffffff; }
    </style>
  </head>
  <body>
    ${sheetMarkup}
  </body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '794px';
  iframe.style.height = '559px';
  iframe.style.border = 'none';
  iframe.style.zIndex = '-9999';
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) {
      throw new Error('Could not initialize payment slip render frame.');
    }

    doc.open();
    doc.write(html);
    doc.close();

    await waitForImages(doc);
    await new Promise((r) => setTimeout(r, 120));

    const target = doc.querySelector('.payment-slip-sheet') as HTMLElement | null;
    if (!target) {
      throw new Error('Payment slip sheet element not found.');
    }

    const captureScale =
      typeof window !== 'undefined' && window.innerWidth < 768 ? 2 : 2.5;

    const canvas = await html2canvas(target, {
      scale: captureScale,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: 794,
      height: 559,
      windowWidth: 794,
      windowHeight: 559,
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [210, 148.5],
    });
    pdf.addImage(imgData, 'PNG', 0, 0, 210, 148.5);
    pdf.save(`Payment_Slip_${details.fileTag}.pdf`);
  } finally {
    if (document.body.contains(iframe)) {
      document.body.removeChild(iframe);
    }
  }
}

function triggerBlobDownload(blobUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function inferImageExt(nameOrMime?: string | null): string | null {
  const raw = String(nameOrMime || '').toLowerCase();
  const extMatch = raw.match(/\.(jpe?g|png|webp|gif|bmp|heic|heif)(\?.*)?$/i);
  if (extMatch) return `.${extMatch[1].toLowerCase()}`;
  if (raw.includes('jpeg') || raw.includes('jpg')) return '.jpg';
  if (raw.includes('png')) return '.png';
  if (raw.includes('webp')) return '.webp';
  if (raw.includes('gif')) return '.gif';
  if (raw.includes('bmp')) return '.bmp';
  if (raw.includes('heic')) return '.heic';
  if (raw.includes('heif')) return '.heif';
  return null;
}

export async function downloadUploadedReceiptImage(
  source: File | string,
  fileTag: string
): Promise<void> {
  if (source instanceof File) {
    const ext = inferImageExt(source.name) || inferImageExt(source.type) || '.jpg';
    const objectUrl = URL.createObjectURL(source);
    try {
      triggerBlobDownload(objectUrl, `Payment_Receipt_${fileTag}${ext}`);
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    }
    return;
  }

  const resolvedUrl = getMediaUrl(String(source));
  if (!resolvedUrl) {
    throw new Error('Uploaded receipt URL is not available.');
  }

  try {
    const res = await fetch(resolvedUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const ext = inferImageExt(resolvedUrl) || inferImageExt(blob.type) || '.jpg';
    const objectUrl = URL.createObjectURL(blob);
    try {
      triggerBlobDownload(objectUrl, `Payment_Receipt_${fileTag}${ext}`);
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    }
  } catch {
    const ext = inferImageExt(resolvedUrl) || '.jpg';
    triggerBlobDownload(resolvedUrl, `Payment_Receipt_${fileTag}${ext}`);
  }
}

export async function downloadMultipleUploadedReceiptImages(
  entries: Array<{ source: File | string; fileTag: string }>
): Promise<void> {
  for (let i = 0; i < entries.length; i++) {
    await downloadUploadedReceiptImage(entries[i].source, entries[i].fileTag);
    if (i < entries.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}
