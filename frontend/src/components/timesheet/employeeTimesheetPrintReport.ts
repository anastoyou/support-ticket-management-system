export interface EmployeeWorkLogItem {
    worklog_id: number;
    work_date: string;
    from_time?: string | null;
    to_time?: string | null;
    hours: number | string;
    hourly_rate?: number | string;
    labour_amount?: number | string;
    log_type?: string;
    work_done?: string;
    ticket?: {
        ticket_id: number;
        work_order_no?: string;
        title?: string;
        store?: {
            store_id?: string;
            store_name?: string;
            short_code?: string;
        };
    } | null;
    stores?: Array<{
        store_id: string;
        store_name: string;
        short_code?: string;
    }>;
}

export interface EmployeePrintDetails {
    workerId: number;
    workerName: string;
    employeeNo?: string;
    role?: string;
    subDepartments?: string;
    hourlyRate?: number | string;
    fromDate: string;
    toDate: string;
    generatedAt?: string;
    logs: EmployeeWorkLogItem[];
}

function escapeHtml(str: string | null | undefined): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDayOfWeek(dateStr: string): string {
    try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return dt.toLocaleDateString('en-US', { weekday: 'short' });
    } catch {
        return '';
    }
}

function formatDateFormatted(dateStr: string): string {
    try {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return dateStr;
    }
}

function formatTimeSlot(fromTime?: string | null, toTime?: string | null): string {
    if (!fromTime && !toTime) return 'Unscheduled';
    const cleanFrom = (fromTime || '').slice(0, 5);
    const cleanTo = (toTime || '').slice(0, 5);
    return `${cleanFrom || '--:--'} – ${cleanTo || '--:--'}`;
}

export function buildEmployeeTimesheetPrintHtml(data: EmployeePrintDetails): string {
    const {
        workerName,
        employeeNo,
        role,
        subDepartments,
        hourlyRate,
        fromDate,
        toDate,
        logs = [],
    } = data;

    const totalHours = logs.reduce((acc, l) => acc + (Number(l.hours) || 0), 0);
    const uniqueDates = Array.from(new Set(logs.map((l) => l.work_date))).filter(Boolean);
    const totalWorkingDays = uniqueDates.length;
    const avgDailyHours = totalWorkingDays > 0 ? (totalHours / totalWorkingDays) : 0;
    const uniqueTickets = Array.from(
        new Set(logs.filter((l) => l.ticket?.ticket_id).map((l) => l.ticket!.ticket_id))
    );
    const rateNum = Number(hourlyRate) || 0;
    const estimatedLabourCost = rateNum > 0 ? totalHours * rateNum : 0;

    // Group logs by date
    const dateMap = new Map<string, EmployeeWorkLogItem[]>();
    logs.forEach((log) => {
        const d = log.work_date || 'Unspecified';
        if (!dateMap.has(d)) {
            dateMap.set(d, []);
        }
        dateMap.get(d)!.push(log);
    });

    const sortedDates = Array.from(dateMap.keys()).sort();

    const nowFormatted = new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    let tableRowsHtml = '';
    let rowCounter = 1;

    sortedDates.forEach((dateKey) => {
        const dayLogs = dateMap.get(dateKey) || [];
        const dayTotal = dayLogs.reduce((acc, l) => acc + (Number(l.hours) || 0), 0);
        const dayOfWeek = formatDayOfWeek(dateKey);
        const formattedDate = formatDateFormatted(dateKey);

        dayLogs.forEach((log, idx) => {
            const isFirst = idx === 0;
            const timeSlot = formatTimeSlot(log.from_time, log.to_time);
            const hoursVal = (Number(log.hours) || 0).toFixed(2);

            let refTitle = 'Timesheet Log';
            let isTicket = false;
            let locationText = '-';

            if (log.ticket) {
                isTicket = true;
                const wo = log.ticket.work_order_no || `#${log.ticket.ticket_id}`;
                refTitle = `Ticket ${wo}${log.ticket.title ? ` – ${log.ticket.title}` : ''}`;
                if (log.ticket.store) {
                    locationText = log.ticket.store.short_code
                        ? `${log.ticket.store.short_code} (${log.ticket.store.store_name})`
                        : log.ticket.store.store_name || '-';
                }
            } else if (log.stores && log.stores.length > 0) {
                locationText = log.stores
                    .map((s) => s.short_code || s.store_name)
                    .join(', ');
            }

            const remarks = log.work_done || '-';

            tableRowsHtml += `
            <tr class="${idx % 2 === 0 ? 'row-even' : 'row-odd'}">
                <td style="text-align: center; color: #64748b; font-size: 10px;">${rowCounter++}</td>
                <td style="font-weight: ${isFirst ? '600' : '400'}; white-space: nowrap;">
                    ${isFirst ? `${formattedDate} <span style="font-size: 10px; color: #64748b; margin-left: 2px;">(${dayOfWeek})</span>` : ''}
                </td>
                <td style="font-family: 'Courier New', monospace; font-size: 10.5px; white-space: nowrap; text-align: center;">${timeSlot}</td>
                <td style="text-align: right; font-weight: 700; color: #0f172a; padding-right: 10px;">${hoursVal} hrs</td>
                <td style="font-size: 10.5px;">
                    <span class="${isTicket ? 'badge-ticket' : 'badge-timesheet'}">
                        ${isTicket ? 'TICKET' : 'MANUAL'}
                    </span>
                    <span style="font-weight: 600; color: #1e293b; margin-left: 4px;">${escapeHtml(refTitle)}</span>
                </td>
                <td style="font-size: 10.5px; color: #334155;">${escapeHtml(locationText)}</td>
                <td style="font-size: 10px; color: #475569;">${escapeHtml(remarks)}</td>
            </tr>`;
        });

        // Daily subtotal row if more than 1 entry on that day
        if (dayLogs.length > 1) {
            tableRowsHtml += `
            <tr class="daily-subtotal-row">
                <td colspan="3" style="text-align: right; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #475569; padding-right: 8px;">
                    Subtotal for ${formattedDate}:
                </td>
                <td style="text-align: right; font-weight: 800; color: #0369a1; padding-right: 10px;">
                    ${dayTotal.toFixed(2)} hrs
                </td>
                <td colspan="3" style="font-size: 10px; color: #64748b; font-style: italic;">
                    ${dayLogs.length} session(s)
                </td>
            </tr>`;
        }
    });

    if (logs.length === 0) {
        tableRowsHtml = `
        <tr>
            <td colspan="7" style="text-align: center; padding: 30px; color: #64748b; font-size: 12px;">
                No work logs recorded for the selected period (${formatDateFormatted(fromDate)} – ${formatDateFormatted(toDate)}).
            </td>
        </tr>`;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Timesheet Report - ${escapeHtml(workerName)}</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 12mm 14mm 14mm 14mm;
            @bottom-right {
                content: counter(page) " / " counter(pages);
            }
        }
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #0f172a;
            background: #ffffff;
            font-size: 11px;
            line-height: 1.35;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        .header-container {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 10px;
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }
        .header-title {
            font-size: 18px;
            font-weight: 900;
            color: #0f172a;
            letter-spacing: -0.3px;
            text-transform: uppercase;
        }
        .header-subtitle {
            font-size: 11px;
            font-weight: 700;
            color: #475569;
            margin-top: 2px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .header-meta {
            text-align: right;
            font-size: 9.5px;
            color: #64748b;
        }
        .header-meta strong {
            color: #0f172a;
        }

        .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 12px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 10px 14px;
        }
        .detail-item {
            display: flex;
            font-size: 10.5px;
            margin-bottom: 3px;
        }
        .detail-label {
            font-weight: 700;
            width: 110px;
            color: #475569;
            flex-shrink: 0;
        }
        .detail-value {
            font-weight: 600;
            color: #0f172a;
        }

        .kpi-row {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
            margin-bottom: 14px;
        }
        .kpi-card {
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 8px 10px;
            text-align: center;
            background: #f8fafc;
        }
        .kpi-card.highlight {
            border-color: #38bdf8;
            background: #f0f9ff;
        }
        .kpi-value {
            font-size: 16px;
            font-weight: 900;
            color: #0f172a;
            line-height: 1.1;
        }
        .kpi-value.blue {
            color: #0284c7;
        }
        .kpi-value.emerald {
            color: #059669;
        }
        .kpi-label {
            font-size: 9px;
            font-weight: 700;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.3px;
            margin-top: 3px;
        }

        table.timesheet-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 16px;
            font-size: 10.5px;
        }
        table.timesheet-table th {
            background-color: #1e293b;
            color: #ffffff;
            font-weight: 700;
            font-size: 9.5px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
            padding: 6px 6px;
            border: 1px solid #1e293b;
            text-align: left;
        }
        table.timesheet-table td {
            padding: 5px 6px;
            border: 1px solid #e2e8f0;
            vertical-align: middle;
        }
        table.timesheet-table tr.row-even {
            background-color: #ffffff;
        }
        table.timesheet-table tr.row-odd {
            background-color: #f8fafc;
        }
        table.timesheet-table tr.daily-subtotal-row {
            background-color: #f1f5f9;
            border-top: 1px dashed #cbd5e1;
            border-bottom: 1.5px solid #cbd5e1;
        }
        table.timesheet-table tfoot td {
            background-color: #0f172a;
            color: #ffffff;
            font-weight: 800;
            padding: 7px 8px;
            font-size: 11px;
            border: 1px solid #0f172a;
        }

        .badge-ticket {
            font-size: 8px;
            font-weight: 800;
            background: #dbeafe;
            color: #1e40af;
            padding: 1px 4px;
            border-radius: 3px;
            border: 1px solid #bfdbfe;
            display: inline-block;
        }
        .badge-timesheet {
            font-size: 8px;
            font-weight: 800;
            background: #fef3c7;
            color: #92400e;
            padding: 1px 4px;
            border-radius: 3px;
            border: 1px solid #fde68a;
            display: inline-block;
        }

        .signatures-section {
            page-break-inside: avoid;
            break-inside: avoid;
            margin-top: 24px;
            padding-top: 14px;
            border-top: 1.5px solid #cbd5e1;
        }
        .sig-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 20px;
        }
        .sig-box {
            text-align: left;
        }
        .sig-role {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            color: #1e293b;
            margin-bottom: 30px;
        }
        .sig-line {
            border-bottom: 1px solid #94a3b8;
            margin-bottom: 4px;
        }
        .sig-caption {
            font-size: 9px;
            color: #64748b;
        }

        .footer-note {
            page-break-inside: avoid;
            margin-top: 14px;
            font-size: 8.5px;
            color: #94a3b8;
            text-align: center;
            border-top: 1px dashed #e2e8f0;
            padding-top: 6px;
        }

        @media print {
            .no-print {
                display: none !important;
            }
            body {
                margin: 0;
                padding: 0;
            }
            tr {
                page-break-inside: avoid;
                break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <!-- Top Header -->
    <div class="header-container">
        <div>
            <div class="header-title">Maintenance Management System</div>
            <div class="header-subtitle">Employee Timesheet &amp; Work Log Report</div>
        </div>
        <div class="header-meta">
            <div><strong>Period:</strong> ${formatDateFormatted(fromDate)} – ${formatDateFormatted(toDate)}</div>
            <div><strong>Printed On:</strong> ${nowFormatted}</div>
        </div>
    </div>

    <!-- Employee Details Summary -->
    <div class="details-grid">
        <div>
            <div class="detail-item">
                <span class="detail-label">Employee Name:</span>
                <span class="detail-value">${escapeHtml(workerName)}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Employee ID:</span>
                <span class="detail-value">${escapeHtml(employeeNo || 'N/A')}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Role / Title:</span>
                <span class="detail-value">${escapeHtml(role || 'Technician')}</span>
            </div>
        </div>
        <div>
            <div class="detail-item">
                <span class="detail-label">Sub Department:</span>
                <span class="detail-value">${escapeHtml(subDepartments || 'General Maintenance')}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Hourly Rate:</span>
                <span class="detail-value">${rateNum > 0 ? `${rateNum.toFixed(3)} KWD / hr` : 'Standard'}</span>
            </div>
            <div class="detail-item">
                <span class="detail-label">Reporting Range:</span>
                <span class="detail-value">${fromDate} to ${toDate}</span>
            </div>
        </div>
    </div>

    <!-- KPI Summary Row -->
    <div class="kpi-row">
        <div class="kpi-card highlight">
            <div class="kpi-value blue">${totalHours.toFixed(2)}</div>
            <div class="kpi-label">Total Logged Hours</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-value">${totalWorkingDays}</div>
            <div class="kpi-label">Working Days</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-value">${avgDailyHours.toFixed(1)} hrs</div>
            <div class="kpi-label">Daily Average</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-value">${uniqueTickets.length}</div>
            <div class="kpi-label">Tickets Handled</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-value emerald">${rateNum > 0 ? `${estimatedLabourCost.toFixed(3)} KWD` : `${logs.length} entries`}</div>
            <div class="kpi-label">${rateNum > 0 ? 'Est. Labour Cost' : 'Total Entries'}</div>
        </div>
    </div>

    <!-- Work Logs Table -->
    <table class="timesheet-table">
        <thead>
            <tr>
                <th style="width: 25px; text-align: center;">#</th>
                <th style="width: 95px;">Date &amp; Day</th>
                <th style="width: 85px; text-align: center;">Time Slot</th>
                <th style="width: 70px; text-align: right; padding-right: 10px;">Hours</th>
                <th style="width: 160px;">Type / Reference</th>
                <th style="width: 120px;">Store / Location</th>
                <th>Work Done / Remarks</th>
            </tr>
        </thead>
        <tbody>
            ${tableRowsHtml}
        </tbody>
        <tfoot>
            <tr>
                <td colspan="3" style="text-align: right; text-transform: uppercase;">
                    Total Summary (${logs.length} entries across ${totalWorkingDays} days):
                </td>
                <td style="text-align: right; padding-right: 10px; font-size: 11.5px;">
                    ${totalHours.toFixed(2)} hrs
                </td>
                <td colspan="3" style="text-align: right; font-size: 10px; font-weight: normal;">
                    ${rateNum > 0 ? `Total Labour Amount: <strong>${estimatedLabourCost.toFixed(3)} KWD</strong>` : ''}
                </td>
            </tr>
        </tfoot>
    </table>

    <!-- Official Signatures -->
    <div class="signatures-section">
        <div class="sig-grid">
            <div class="sig-box">
                <div class="sig-role">Employee Acknowledgement</div>
                <div class="sig-line"></div>
                <div class="sig-caption">${escapeHtml(workerName)} &bull; Signature &amp; Date</div>
            </div>
            <div class="sig-box">
                <div class="sig-role">Supervisor / In-Charge Verification</div>
                <div class="sig-line"></div>
                <div class="sig-caption">Maintenance Supervisor &bull; Signature &amp; Date</div>
            </div>
            <div class="sig-box">
                <div class="sig-role">Operations / HR Approval</div>
                <div class="sig-line"></div>
                <div class="sig-caption">Management / Office &bull; Signature &amp; Date</div>
            </div>
        </div>
    </div>

    <div class="footer-note">
        System-generated A4 document &bull; Maintenance Tracker &bull; Page printed for official records.
    </div>
</body>
</html>`;
}

export async function printEmployeeTimesheetReport(data: EmployeePrintDetails): Promise<void> {
    const printHtml = buildEmployeeTimesheetPrintHtml(data);

    await new Promise<void>((resolve) => {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.left = '-10000px';
        iframe.style.top = '0';
        iframe.style.width = '794px';
        iframe.style.height = '1123px';
        iframe.style.border = 'none';
        iframe.style.zIndex = '-9999';
        document.body.appendChild(iframe);

        const win = iframe.contentWindow;
        if (!win) {
            document.body.removeChild(iframe);
            resolve();
            return;
        }

        win.document.open();
        win.document.write(printHtml);
        win.document.close();

        let isPrinted = false;
        const triggerPrint = () => {
            if (isPrinted) return;
            isPrinted = true;
            try {
                win.focus();
                win.print();
            } catch (err) {
                console.error('Iframe print failed, falling back to popup window:', err);
                const popup = window.open('', '_blank');
                if (popup) {
                    popup.document.open();
                    popup.document.write(printHtml);
                    popup.document.close();
                    setTimeout(() => {
                        popup.focus();
                        popup.print();
                    }, 400);
                }
            } finally {
                setTimeout(() => {
                    if (document.body.contains(iframe)) {
                        document.body.removeChild(iframe);
                    }
                    resolve();
                }, 1200);
            }
        };

        iframe.onload = () => {
            setTimeout(triggerPrint, 250);
        };
        if (win.document.readyState === 'complete') {
            setTimeout(triggerPrint, 250);
        }
    });
}

