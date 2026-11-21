import {
    API_URL,
    type Ticket,
    type Allocation,
    type WorkLog,
    type Expense,
    type Media,
    getMediaUrl,
    isImage,
    isVideo,
    isAudio,
} from './TicketsTypesAndComponents';

export interface TicketPrintSectionsConfig {
    qrCode: boolean;
    kpiSummary: boolean;
    classificationAndStore: boolean;
    description: boolean;
    approvals: boolean;
    allocatedPersonnel: boolean;
    workLogs: boolean;
    expenses: boolean;
    beforeMedia: boolean;
    afterMedia: boolean;
    expenseMedia: boolean;
    historyTimeline: boolean;
}

export const DEFAULT_PRINT_SECTIONS: TicketPrintSectionsConfig = {
    qrCode: true,
    kpiSummary: true,
    classificationAndStore: true,
    description: true,
    approvals: true,
    allocatedPersonnel: true,
    workLogs: true,
    expenses: true,
    beforeMedia: true,
    afterMedia: true,
    expenseMedia: true,
    historyTimeline: true,
};

// ─── ISO/IEC 18004 QR Code SVG Generator (Byte Mode, ECC Level L, Versions 1-10) ───

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
    let x = 1;
    for (let i = 0; i < 255; i++) {
        GF_EXP[i] = x;
        GF_LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
        GF_EXP[i] = GF_EXP[i - 255];
    }
})();

function gfMul(a: number, b: number): number {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
    let poly = new Uint8Array([1]);
    for (let i = 0; i < degree; i++) {
        const next = new Uint8Array(poly.length + 1);
        const factor = GF_EXP[i];
        for (let j = 0; j < poly.length; j++) {
            next[j] ^= poly[j];
            next[j + 1] ^= gfMul(poly[j], factor);
        }
        poly = next;
    }
    return poly;
}

function rsEncode(data: Uint8Array, ecLen: number): Uint8Array {
    const gen = rsGeneratorPoly(ecLen);
    const rem = new Uint8Array(ecLen);
    for (let i = 0; i < data.length; i++) {
        const factor = data[i] ^ rem[0];
        rem.copyWithin(0, 1);
        rem[ecLen - 1] = 0;
        for (let j = 0; j < ecLen; j++) {
            rem[j] ^= gfMul(gen[j + 1], factor);
        }
    }
    return rem;
}

interface QrVersionSpec {
    version: number;
    totalDataCodewords: number;
    ecCodewordsPerBlock: number;
    numBlocksGroup1: number;
    dataCodewordsGroup1: number;
    numBlocksGroup2: number;
    dataCodewordsGroup2: number;
    alignmentPatterns: number[];
}

const QR_VERSIONS_L: QrVersionSpec[] = [
    { version: 1, totalDataCodewords: 19, ecCodewordsPerBlock: 7, numBlocksGroup1: 1, dataCodewordsGroup1: 19, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [] },
    { version: 2, totalDataCodewords: 34, ecCodewordsPerBlock: 10, numBlocksGroup1: 1, dataCodewordsGroup1: 34, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 18] },
    { version: 3, totalDataCodewords: 55, ecCodewordsPerBlock: 15, numBlocksGroup1: 1, dataCodewordsGroup1: 55, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 22] },
    { version: 4, totalDataCodewords: 80, ecCodewordsPerBlock: 20, numBlocksGroup1: 1, dataCodewordsGroup1: 80, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 26] },
    { version: 5, totalDataCodewords: 108, ecCodewordsPerBlock: 26, numBlocksGroup1: 1, dataCodewordsGroup1: 108, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 30] },
    { version: 6, totalDataCodewords: 136, ecCodewordsPerBlock: 18, numBlocksGroup1: 2, dataCodewordsGroup1: 68, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 34] },
    { version: 7, totalDataCodewords: 156, ecCodewordsPerBlock: 20, numBlocksGroup1: 2, dataCodewordsGroup1: 78, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 22, 38] },
    { version: 8, totalDataCodewords: 194, ecCodewordsPerBlock: 24, numBlocksGroup1: 2, dataCodewordsGroup1: 97, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 24, 42] },
    { version: 9, totalDataCodewords: 232, ecCodewordsPerBlock: 30, numBlocksGroup1: 2, dataCodewordsGroup1: 116, numBlocksGroup2: 0, dataCodewordsGroup2: 0, alignmentPatterns: [6, 26, 46] },
    { version: 10, totalDataCodewords: 274, ecCodewordsPerBlock: 18, numBlocksGroup1: 2, dataCodewordsGroup1: 68, numBlocksGroup2: 2, dataCodewordsGroup2: 69, alignmentPatterns: [6, 28, 50] },
];

export function generateQrCodeSvg(text: string, sizePx: number = 88): string {
    const utf8Bytes = new TextEncoder().encode(text);
    const byteLen = utf8Bytes.length;

    let spec = QR_VERSIONS_L[QR_VERSIONS_L.length - 1];
    for (const candidate of QR_VERSIONS_L) {
        const lenBits = candidate.version <= 9 ? 8 : 16;
        const maxBytes = Math.floor((candidate.totalDataCodewords * 8 - 4 - lenBits) / 8);
        if (byteLen <= maxBytes) {
            spec = candidate;
            break;
        }
    }

    const version = spec.version;
    const size = version * 4 + 17;

    const bits: number[] = [];
    const pushBits = (val: number, count: number) => {
        for (let i = count - 1; i >= 0; i--) {
            bits.push((val >>> i) & 1);
        }
    };

    pushBits(0b0100, 4);
    pushBits(byteLen, version <= 9 ? 8 : 16);
    for (let i = 0; i < byteLen; i++) {
        pushBits(utf8Bytes[i], 8);
    }

    const totalDataBits = spec.totalDataCodewords * 8;
    const terminatorLen = Math.min(4, totalDataBits - bits.length);
    pushBits(0, terminatorLen);

    while (bits.length % 8 !== 0) {
        bits.push(0);
    }

    const dataCodewords = new Uint8Array(spec.totalDataCodewords);
    const byteCountSoFar = bits.length / 8;
    for (let i = 0; i < byteCountSoFar; i++) {
        let b = 0;
        for (let j = 0; j < 8; j++) {
            b = (b << 1) | bits[i * 8 + j];
        }
        dataCodewords[i] = b;
    }

    const padBytes = [0xec, 0x11];
    for (let i = byteCountSoFar; i < spec.totalDataCodewords; i++) {
        dataCodewords[i] = padBytes[(i - byteCountSoFar) % 2];
    }

    const dataBlocks: Uint8Array[] = [];
    const ecBlocks: Uint8Array[] = [];
    let offset = 0;

    for (let i = 0; i < spec.numBlocksGroup1; i++) {
        const block = dataCodewords.slice(offset, offset + spec.dataCodewordsGroup1);
        offset += spec.dataCodewordsGroup1;
        dataBlocks.push(block);
        ecBlocks.push(rsEncode(block, spec.ecCodewordsPerBlock));
    }
    for (let i = 0; i < spec.numBlocksGroup2; i++) {
        const block = dataCodewords.slice(offset, offset + spec.dataCodewordsGroup2);
        offset += spec.dataCodewordsGroup2;
        dataBlocks.push(block);
        ecBlocks.push(rsEncode(block, spec.ecCodewordsPerBlock));
    }

    const finalCodewords: number[] = [];
    const maxDataBlockLen = Math.max(spec.dataCodewordsGroup1, spec.dataCodewordsGroup2);
    for (let i = 0; i < maxDataBlockLen; i++) {
        for (const block of dataBlocks) {
            if (i < block.length) finalCodewords.push(block[i]);
        }
    }
    for (let i = 0; i < spec.ecCodewordsPerBlock; i++) {
        for (const block of ecBlocks) {
            if (i < block.length) finalCodewords.push(block[i]);
        }
    }

    const modules: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
    const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

    const setFunctionModule = (r: number, c: number, dark: boolean) => {
        if (r >= 0 && r < size && c >= 0 && c < size) {
            modules[r][c] = dark;
            isFunction[r][c] = true;
        }
    };

    const drawFinderPattern = (centerR: number, centerC: number) => {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const dist = Math.max(Math.abs(dx), Math.abs(dy));
                const r = centerR + dy;
                const c = centerC + dx;
                if (r >= 0 && r < size && c >= 0 && c < size) {
                    setFunctionModule(r, c, dist !== 2 && dist !== 4);
                }
            }
        }
    };

    drawFinderPattern(3, 3);
    drawFinderPattern(3, size - 4);
    drawFinderPattern(size - 4, 3);

    for (let i = 8; i < size - 8; i++) {
        setFunctionModule(6, i, i % 2 === 0);
        setFunctionModule(i, 6, i % 2 === 0);
    }

    const alignCoords = spec.alignmentPatterns;
    for (const r of alignCoords) {
        for (const c of alignCoords) {
            if (
                (r === 6 && c === 6) ||
                (r === 6 && c === size - 7) ||
                (r === size - 7 && c === 6)
            ) {
                continue;
            }
            for (let dy = -2; dy <= 2; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    const dist = Math.max(Math.abs(dx), Math.abs(dy));
                    setFunctionModule(r + dy, c + dx, dist !== 1);
                }
            }
        }
    }

    for (let i = 0; i <= 8; i++) {
        if (i !== 6) {
            if (!isFunction[8][i]) setFunctionModule(8, i, false);
            if (!isFunction[i][8]) setFunctionModule(i, 8, false);
        }
    }
    for (let i = 0; i < 8; i++) {
        if (!isFunction[8][size - 1 - i]) setFunctionModule(8, size - 1 - i, false);
        if (!isFunction[size - 1 - i][8]) setFunctionModule(size - 1 - i, 8, false);
    }
    setFunctionModule(size - 8, 8, true);

    let bitIdx = 0;
    const totalBitsToPlace = finalCodewords.length * 8;
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        const upward = ((right + 1) & 2) === 0;
        for (let vert = 0; vert < size; vert++) {
            const r = upward ? size - 1 - vert : vert;
            for (let j = 0; j < 2; j++) {
                const c = right - j;
                if (!isFunction[r][c]) {
                    let dark = false;
                    if (bitIdx < totalBitsToPlace) {
                        const cw = finalCodewords[bitIdx >>> 3];
                        dark = ((cw >>> (7 - (bitIdx & 7))) & 1) !== 0;
                        bitIdx++;
                    }
                    if ((r + c) % 2 === 0) {
                        dark = !dark;
                    }
                    modules[r][c] = dark;
                }
            }
        }
    }

    const formatBits = 0x77c4;
    const getFormatBit = (idx: number) => ((formatBits >>> idx) & 1) !== 0;

    for (let i = 0; i <= 5; i++) setFunctionModule(i, 8, getFormatBit(i));
    setFunctionModule(7, 8, getFormatBit(6));
    setFunctionModule(8, 8, getFormatBit(7));
    setFunctionModule(8, 7, getFormatBit(8));
    for (let i = 9; i < 15; i++) setFunctionModule(8, 14 - i, getFormatBit(i));

    for (let i = 0; i < 8; i++) setFunctionModule(8, size - 1 - i, getFormatBit(i));
    for (let i = 8; i < 15; i++) setFunctionModule(size - 15 + i, 8, getFormatBit(i));

    const margin = 2;
    const totalModules = size + margin * 2;
    let pathData = '';
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (modules[r][c]) {
                pathData += `M${c + margin},${r + margin}h1v1h-1z`;
            }
        }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${totalModules}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges" style="display:block;background:#ffffff;border-radius:4px;">
        <rect width="${totalModules}" height="${totalModules}" fill="#ffffff"/>
        <path d="${pathData}" fill="#334155"/>
    </svg>`;
}

// ─── Video Starting Frame & Rotated Image Extraction Helpers ─────────────────

async function tryExtractVideoFrameDataUrl(
    srcUrl: string,
    rotation: number = 0
): Promise<{ dataUrl: string; heightRatio: number } | null> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (res: { dataUrl: string; heightRatio: number } | null) => {
            if (settled) return;
            settled = true;
            resolve(res);
        };

        const timeoutId = window.setTimeout(() => {
            finish(null);
        }, 1800);

        try {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';

            const cleanup = () => {
                window.clearTimeout(timeoutId);
                try {
                    video.pause();
                    video.removeAttribute('src');
                    video.load();
                } catch {
                    // ignore cleanup errors
                }
            };

            const drawFrame = () => {
                try {
                    const vw = video.videoWidth;
                    const vh = video.videoHeight;
                    if (!vw || !vh) {
                        cleanup();
                        finish(null);
                        return;
                    }
                    const normAngle = ((rotation % 360) + 360) % 360;
                    const canvas = document.createElement('canvas');
                    const maxDim = 800;
                    const scale = Math.min(1, maxDim / Math.max(vw, vh));
                    const sw = Math.round(vw * scale);
                    const sh = Math.round(vh * scale);

                    if (normAngle === 90 || normAngle === 270) {
                        canvas.width = sh;
                        canvas.height = sw;
                    } else {
                        canvas.width = sw;
                        canvas.height = sh;
                    }

                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        cleanup();
                        finish(null);
                        return;
                    }

                    ctx.save();
                    ctx.translate(canvas.width / 2, canvas.height / 2);
                    ctx.rotate((normAngle * Math.PI) / 180);
                    ctx.drawImage(video, -sw / 2, -sh / 2, sw, sh);
                    ctx.restore();

                    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
                    const heightRatio = canvas.width > 0 ? canvas.height / canvas.width : 0.75;
                    cleanup();
                    finish({ dataUrl, heightRatio });
                } catch {
                    cleanup();
                    finish(null);
                }
            };

            video.onloadedmetadata = () => {
                try {
                    video.currentTime = 0.05;
                } catch {
                    drawFrame();
                }
            };

            video.onseeked = drawFrame;
            video.onloadeddata = () => {
                if (video.readyState >= 2 && video.currentTime > 0) {
                    drawFrame();
                }
            };
            video.onerror = () => {
                cleanup();
                finish(null);
            };

            video.src = srcUrl;
        } catch {
            window.clearTimeout(timeoutId);
            finish(null);
        }
    });
}

async function preparePrintableImage(
    imageUrl: string,
    rotation: number = 0
): Promise<{ url: string; heightRatio: number }> {
    const normAngle = ((rotation % 360) + 360) % 360;
    return new Promise((resolve) => {
        let settled = false;
        const finish = (url: string, heightRatio: number = 0.75) => {
            if (settled) return;
            settled = true;
            resolve({ url, heightRatio });
        };
        const timeoutId = window.setTimeout(() => finish(imageUrl, 0.75), 2500);

        const img = new window.Image();
        if (normAngle !== 0) {
            img.crossOrigin = 'anonymous';
        }
        img.onload = () => {
            window.clearTimeout(timeoutId);
            const rawW = img.naturalWidth || img.width || 4;
            const rawH = img.naturalHeight || img.height || 3;
            const effW = normAngle === 90 || normAngle === 270 ? rawH : rawW;
            const effH = normAngle === 90 || normAngle === 270 ? rawW : rawH;
            const ratio = effW > 0 ? Math.min(2.2, Math.max(0.35, effH / effW)) : 0.75;

            if (normAngle === 0) {
                finish(imageUrl, ratio);
                return;
            }
            try {
                const canvas = document.createElement('canvas');
                canvas.width = effW;
                canvas.height = effH;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    finish(imageUrl, ratio);
                    return;
                }
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((normAngle * Math.PI) / 180);
                ctx.drawImage(img, -rawW / 2, -rawH / 2);
                finish(canvas.toDataURL('image/jpeg', 0.92), ratio);
            } catch {
                finish(imageUrl, ratio);
            }
        };
        img.onerror = () => {
            window.clearTimeout(timeoutId);
            finish(imageUrl, 0.75);
        };
        img.src = imageUrl;
    });
}

// ─── HTML Escaping & Formatting Utilities ────────────────────────────────────

function escapeHtml(val: unknown): string {
    if (val === null || val === undefined) return '';
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDateTime(dateStr?: string | null): string {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDateOnly(dateStr?: string | null): string {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
}

interface PrintableMediaEntry {
    mediaId?: number;
    fileName: string;
    displayUrl: string;
    renderAsVideoTag: boolean;
    rotation: number;
    heightRatio: number;
    uploadedBy: string;
    uploadedByRole?: string;
    uploadedDate: string;
    categoryLabel: string;
    sectionGroup: 'before' | 'after' | 'expense' | 'other';
    expenseMeta?: string;
}

export interface PrintTicketOptions {
    ticketDetails: Ticket;
    ticketSubDeptName?: string;
    allocations: Allocation[];
    workLogs: WorkLog[];
    expenses: Expense[];
    mediaList: Media[];
    issueMedia: Media[];
    completedMedia: Media[];
    token: string | null;
    currentUser?: any;
    sections?: TicketPrintSectionsConfig;
    isPreview?: boolean;
}

function collectRawMediaEntries(options: PrintTicketOptions) {
    const {
        ticketDetails,
        expenses,
        mediaList,
        issueMedia,
        completedMedia,
        sections = DEFAULT_PRINT_SECTIONS,
    } = options;

    const isMediaAudio = (m: any): boolean => {
        const fName = String(m?.file_name || '');
        const fUrl = String(m?.file_url || '');
        return isAudio(fName) || isAudio(fUrl);
    };

    const isMediaVideo = (m: any): boolean => {
        if (isMediaAudio(m)) return false;
        const fName = String(m?.file_name || '');
        const fUrl = String(m?.file_url || '');
        return isVideo(fName) || isVideo(fUrl);
    };

    const isMediaImage = (m: any): boolean => {
        if (isMediaAudio(m) || isMediaVideo(m)) return false;
        const fName = String(m?.file_name || '');
        const fUrl = String(m?.file_url || '');
        return isImage(fName) || isImage(fUrl);
    };

    const seenKeys = new Set<string>();
    const rawMediaEntries: {
        media: Media;
        sectionGroup: 'before' | 'after' | 'expense' | 'other';
        categoryLabel: string;
        expenseMeta?: string;
        isVideoItem: boolean;
    }[] = [];

    const registerMedia = (
        m: Media | null | undefined,
        sectionGroup: 'before' | 'after' | 'expense' | 'other',
        categoryLabel: string,
        expenseMeta?: string
    ) => {
        if (!m || !m.file_url) return;
        if (isMediaAudio(m)) return;
        const vid = isMediaVideo(m);
        const img = isMediaImage(m);
        if (!img && !vid) return;

        if (sectionGroup === 'before' && !sections.beforeMedia) return;
        if (sectionGroup === 'after' && !sections.afterMedia) return;
        if (sectionGroup === 'expense' && !sections.expenseMedia) return;
        if (sectionGroup === 'other' && !sections.beforeMedia && !sections.afterMedia) return;

        const key = m.media_id ? `id:${m.media_id}` : `url:${getMediaUrl(m.file_url)}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);

        rawMediaEntries.push({
            media: m,
            sectionGroup,
            categoryLabel,
            expenseMeta,
            isVideoItem: vid,
        });
    };

    (issueMedia || []).forEach((m) => {
        registerMedia(m, 'before', m.category?.category_name || 'Before Repair');
    });

    (completedMedia || []).forEach((m) => {
        registerMedia(m, 'after', m.category?.category_name || 'After Repair');
    });

    (expenses || []).forEach((exp) => {
        const expName = exp.expense_type?.expense_name || 'Expense';
        const expAmt = `${parseFloat(String(exp.amount || 0)).toFixed(3)} KWD`;
        const workerName = exp.worker?.full_name || 'Technician';
        const metaLabel = `${expName} • ${expAmt} (${workerName})`;

        if (exp.receipt) {
            registerMedia(exp.receipt, 'expense', 'Expense Receipt', metaLabel);
        }
        if (Array.isArray(exp.receipts)) {
            exp.receipts.forEach((r) => {
                registerMedia(r, 'expense', 'Expense Receipt', metaLabel);
            });
        }
    });

    const allRemainingSources: Media[] = [
        ...(mediaList || []),
        ...(Array.isArray((ticketDetails as any)?.media) ? (ticketDetails as any).media : []),
    ];

    allRemainingSources.forEach((m) => {
        const catName = m?.category?.category_name || '';
        const lowerCat = catName.toLowerCase();
        if (lowerCat === 'before repair' || lowerCat.includes('issue')) {
            registerMedia(m, 'before', catName || 'Before Repair');
        } else if (lowerCat === 'after repair' || lowerCat.includes('complet')) {
            registerMedia(m, 'after', catName || 'After Repair');
        } else if (lowerCat === 'bills' || lowerCat === 'bill' || lowerCat.includes('receipt')) {
            registerMedia(m, 'expense', catName || 'Expense Receipt');
        } else {
            registerMedia(m, 'other', catName || 'Ticket Attachment');
        }
    });

    return rawMediaEntries;
}

export function buildTicketPrintPreviewHtmlSync(options: PrintTicketOptions): string {
    const rawMediaEntries = collectRawMediaEntries(options);
    const processedMedia: PrintableMediaEntry[] = rawMediaEntries.map(
        ({ media, sectionGroup, categoryLabel, expenseMeta, isVideoItem }) => {
            const fullUrl = getMediaUrl(media.file_url);
            const fileName = media.file_name || fullUrl.split('/').pop() || 'attachment';
            const rotation = media.rotation || 0;
            const uploadedBy =
                media.uploaded_by?.full_name ||
                (media.uploaded_by as any)?.username ||
                'System User';
            const uploadedByRole =
                typeof media.uploaded_by?.role === 'object' && media.uploaded_by?.role
                    ? media.uploaded_by.role.role_name
                    : '';
            const uploadedDate = formatDateTime(media.uploaded_date);

            if (isVideoItem) {
                const videoFrameUrl = fullUrl.includes('#') ? fullUrl : `${fullUrl}#t=0.05`;
                return {
                    mediaId: media.media_id,
                    fileName,
                    displayUrl: videoFrameUrl,
                    renderAsVideoTag: true,
                    rotation,
                    heightRatio: 0.75,
                    uploadedBy,
                    uploadedByRole,
                    uploadedDate,
                    categoryLabel,
                    sectionGroup,
                    expenseMeta,
                };
            }
            return {
                mediaId: media.media_id,
                fileName,
                displayUrl: fullUrl,
                renderAsVideoTag: false,
                rotation,
                heightRatio: 0.75,
                uploadedBy,
                uploadedByRole,
                uploadedDate,
                categoryLabel,
                sectionGroup,
                expenseMeta,
            };
        }
    );

    const fallbackHistory = options.sections?.historyTimeline
        ? [
            {
                changed_date: options.ticketDetails.created_date,
                changed_by: options.ticketDetails.created_by || { full_name: 'System User' },
                status: options.ticketDetails.status || { status_name: 'Open' },
                priority: options.ticketDetails.priority || { priority_name: 'Normal' },
                age_days: options.ticketDetails.age_days ?? 0,
                remarks: 'Ticket created & logged',
            },
        ]
        : [];

    return composeTicketPrintHtmlDocument(options, processedMedia, fallbackHistory, true);
}

export async function buildTicketPrintHtml(options: PrintTicketOptions): Promise<string> {
    const {
        ticketDetails,
        token,
        sections = DEFAULT_PRINT_SECTIONS,
        isPreview = false,
    } = options;

    if (isPreview) {
        return buildTicketPrintPreviewHtmlSync(options);
    }

    const ticketId = ticketDetails.ticket_id;

    // 1. Fetch ticket change history if selected
    let historyRecords: any[] = [];
    if (sections.historyTimeline && token && ticketId) {
        try {
            const resHistory = await fetch(`${API_URL}/maintenance/tickethistory/?ticket=${ticketId}`, {
                headers: { Authorization: `Token ${token}` },
            });
            if (resHistory.ok) {
                const rawHist = await resHistory.json();
                const list = Array.isArray(rawHist)
                    ? rawHist
                    : Array.isArray(rawHist?.results)
                        ? rawHist.results
                        : [];
                historyRecords = [...list].sort(
                    (a: any, b: any) => new Date(a.changed_date).getTime() - new Date(b.changed_date).getTime()
                );
            }
        } catch {
            // Non-blocking if history endpoint is unavailable
        }
    }

    const rawMediaEntries = collectRawMediaEntries(options);

    // 3. Process all images & video starting frames in parallel
    const processedMedia: PrintableMediaEntry[] = await Promise.all(
        rawMediaEntries.map(async ({ media, sectionGroup, categoryLabel, expenseMeta, isVideoItem }) => {
            const fullUrl = getMediaUrl(media.file_url);
            const fileName = media.file_name || fullUrl.split('/').pop() || 'attachment';
            const rotation = media.rotation || 0;
            const uploadedBy =
                media.uploaded_by?.full_name ||
                (media.uploaded_by as any)?.username ||
                'System User';
            const uploadedByRole =
                typeof media.uploaded_by?.role === 'object' && media.uploaded_by?.role
                    ? media.uploaded_by.role.role_name
                    : '';
            const uploadedDate = formatDateTime(media.uploaded_date);

            if (isVideoItem) {
                const extracted = await tryExtractVideoFrameDataUrl(fullUrl, rotation);
                if (extracted) {
                    return {
                        mediaId: media.media_id,
                        fileName,
                        displayUrl: extracted.dataUrl,
                        renderAsVideoTag: false,
                        rotation: 0,
                        heightRatio: extracted.heightRatio,
                        uploadedBy,
                        uploadedByRole,
                        uploadedDate,
                        categoryLabel,
                        sectionGroup,
                        expenseMeta,
                    };
                }
                const videoFrameUrl = fullUrl.includes('#') ? fullUrl : `${fullUrl}#t=0.05`;
                return {
                    mediaId: media.media_id,
                    fileName,
                    displayUrl: videoFrameUrl,
                    renderAsVideoTag: true,
                    rotation,
                    heightRatio: 0.75,
                    uploadedBy,
                    uploadedByRole,
                    uploadedDate,
                    categoryLabel,
                    sectionGroup,
                    expenseMeta,
                };
            } else {
                const prepared = await preparePrintableImage(fullUrl, rotation);
                return {
                    mediaId: media.media_id,
                    fileName,
                    displayUrl: prepared.url,
                    renderAsVideoTag: false,
                    rotation: prepared.url === fullUrl ? rotation : 0,
                    heightRatio: prepared.heightRatio,
                    uploadedBy,
                    uploadedByRole,
                    uploadedDate,
                    categoryLabel,
                    sectionGroup,
                    expenseMeta,
                };
            }
        })
    );

    return composeTicketPrintHtmlDocument(options, processedMedia, historyRecords, false);
}

function composeTicketPrintHtmlDocument(
    options: PrintTicketOptions,
    processedMedia: PrintableMediaEntry[],
    historyRecords: any[],
    isPreview: boolean
): string {
    const {
        ticketDetails,
        ticketSubDeptName,
        allocations,
        workLogs,
        expenses,
        currentUser,
        sections = DEFAULT_PRINT_SECTIONS,
    } = options;

    const ticketId = ticketDetails.ticket_id;
    const workOrderNo = String(ticketDetails.work_order_no || `TICKET-${ticketId}`).replace(/#/g, '');
    const origin = window.location.origin || 'http://localhost:3001';
    const ticketDirectUrl = `${origin}/tickets/all?ticket_id=${ticketId}`;

    const beforeMediaItems = processedMedia.filter((m) => m.sectionGroup === 'before');
    const afterMediaItems = processedMedia.filter((m) => m.sectionGroup === 'after');
    const expenseMediaItems = processedMedia.filter((m) => m.sectionGroup === 'expense');
    const otherMediaItems = processedMedia.filter((m) => m.sectionGroup === 'other');

    // 4. Generate QR Code SVG (encodes the ticket URL, with NO visible URL text printed anywhere)
    const qrCodeSvg = sections.qrCode ? generateQrCodeSvg(ticketDirectUrl, 86) : '';

    // 5. Compute Totals & Metadata
    const totalPlannedHours = (allocations || []).reduce(
        (sum, a) => sum + (parseFloat(String(a.planned_hours || 0)) || 0),
        0
    );
    const totalLoggedHours = (workLogs || []).reduce(
        (sum, wl) => sum + (parseFloat(String(wl.hours || 0)) || 0),
        0
    );
    const totalLabourCost = (workLogs || []).reduce(
        (sum, wl) => sum + (parseFloat(String(wl.labour_amount || 0)) || 0),
        0
    );
    const totalExpensesAmount = (expenses || []).reduce(
        (sum, exp) => sum + (parseFloat(String(exp.amount || 0)) || 0),
        0
    );
    const grandTotalCost = totalLabourCost + totalExpensesAmount;

    const statusName = ticketDetails.status?.status_name || 'Pending';
    const priorityName = ticketDetails.priority?.priority_name || 'Normal';
    const priorityLevel = ticketDetails.priority?.level ?? 1;

    const deptName =
        ticketDetails.department?.department_name ||
        (typeof ticketDetails.department === 'string' ? ticketDetails.department : 'N/A');
    const subDeptDisplay =
        ticketSubDeptName ||
        (ticketDetails as any)?.sub_department?.sub_department_name ||
        (ticketDetails.nature as any)?.sub_department?.sub_department_name ||
        'N/A';
    const natureName =
        ticketDetails.nature?.nature_name ||
        (typeof ticketDetails.nature === 'string' ? ticketDetails.nature : 'N/A');

    const storeObj = ticketDetails.store || ({} as any);
    const storeName = storeObj.store_name || (typeof storeObj === 'string' ? storeObj : 'N/A');
    const storeIdCode = String(storeObj.store_id || 'N/A').replace(/#/g, '');
    const storeType = storeObj.type || '';
    const storeArea =
        typeof storeObj.area === 'object' && storeObj.area
            ? storeObj.area.area_name
            : typeof storeObj.area === 'string'
                ? storeObj.area
                : 'N/A';
    const storeAddress = storeObj.address || 'N/A';
    const storePhone = storeObj.phone || storeObj.whatsapp_number || 'N/A';
    const storeCoords =
        storeObj.latitude && storeObj.longitude
            ? `${storeObj.latitude}, ${storeObj.longitude}`
            : '';
    const storeManagerName = storeObj.manager?.full_name || storeObj.manager?.username || 'N/A';
    const storeManagerPhone = storeObj.manager?.phone || storeObj.manager?.whatsapp_number || '';

    const createdByName =
        ticketDetails.created_by?.full_name ||
        (ticketDetails.created_by as any)?.username ||
        (typeof ticketDetails.created_by === 'string' ? ticketDetails.created_by : 'Unknown User');
    const createdByRole =
        typeof ticketDetails.created_by?.role === 'object' && ticketDetails.created_by?.role
            ? ticketDetails.created_by.role.role_name
            : typeof ticketDetails.created_by?.role === 'string'
                ? ticketDetails.created_by.role
                : '';
    const createdByEmpNo = String(ticketDetails.created_by?.employee_no || '').replace(/#/g, '');
    const createdByPhone = ticketDetails.created_by?.phone || ticketDetails.created_by?.whatsapp_number || '';

    const calculatedAgeDays =
        ticketDetails.age_days != null
            ? `${Number(ticketDetails.age_days).toFixed(1)} Days`
            : ticketDetails.created_date
                ? `${Math.max(0, (Date.now() - new Date(ticketDetails.created_date).getTime()) / (1000 * 60 * 60 * 24)).toFixed(1)} Days`
                : 'N/A';

    const printedByUser =
        currentUser?.full_name ||
        currentUser?.username ||
        'Authorized User';

    let sectionCounter = 0;
    const nextSectionNum = () => {
        sectionCounter += 1;
        return sectionCounter < 10 ? `0${sectionCounter}` : `${sectionCounter}`;
    };

    // Helper to render a Masonry / Multi-Aspect-Ratio Photo Gallery group:
    // - Supports different aspect ratio images (portrait, landscape, square) naturally like a gallery
    // - Balances columns using shortest-column-first placement
    // - NO ticket reference on media cards
    // - Video rendered as starting frame just like an image (no thumbnail label, no play triangle)
    const renderMediaGroupHtml = (
        groupTitle: string,
        groupSubtitle: string,
        badgeBg: string,
        badgeText: string,
        items: PrintableMediaEntry[]
    ): string => {
        if (items.length === 0) return '';

        const renderCardHtml = (item: PrintableMediaEntry): string => {
            const rotStyle = item.rotation ? `transform: rotate(${item.rotation}deg);` : '';

            const visualElementHtml = item.renderAsVideoTag
                ? `<video src="${escapeHtml(item.displayUrl)}" muted playsinline preload="auto" style="${rotStyle}"></video>`
                : `<img src="${escapeHtml(item.displayUrl)}" alt="${escapeHtml(item.fileName)}" style="${rotStyle}" />`;

            return `
                <div class="media-card">
                    <div class="media-thumb-box">
                        ${visualElementHtml}
                    </div>
                    <div class="media-card-body">
                        <div class="media-card-title-row">
                            <span class="media-cat-tag" style="background:${badgeBg};color:${badgeText};">${escapeHtml(item.categoryLabel)}</span>
                            <span class="media-date-tag">${escapeHtml(item.uploadedDate)}</span>
                        </div>
                        ${item.expenseMeta
                    ? `<div class="media-expense-meta">Expense: <strong>${escapeHtml(item.expenseMeta)}</strong></div>`
                    : ''
                }
                        <div class="media-meta-footer">
                            <span><strong>Uploaded By:</strong> ${escapeHtml(item.uploadedBy)}${item.uploadedByRole ? ` (${escapeHtml(item.uploadedByRole)})` : ''}</span>
                        </div>
                    </div>
                </div>
            `;
        };

        const colCount = items.length >= 3 ? 3 : 2;
        const columns: string[][] = Array.from({ length: colCount }, () => []);
        const colHeights: number[] = Array.from({ length: colCount }, () => 0);

        items.forEach((item) => {
            let shortestColIdx = 0;
            for (let c = 1; c < colCount; c++) {
                if (colHeights[c] < colHeights[shortestColIdx]) {
                    shortestColIdx = c;
                }
            }
            columns[shortestColIdx].push(renderCardHtml(item));
            colHeights[shortestColIdx] += (item.heightRatio || 0.75) + 0.25;
        });

        const galleryColsHtml = columns
            .map((colCards) => `<div class="media-gallery-col">${colCards.join('')}</div>`)
            .join('');

        return `
            <div class="media-group-section">
                <div class="media-group-header">
                    <div>
                        <h3 class="media-group-title">${escapeHtml(groupTitle)}</h3>
                        <p class="media-group-subtitle">${escapeHtml(groupSubtitle)}</p>
                    </div>
                    <span class="media-group-count">${items.length} ${items.length === 1 ? 'Item' : 'Items'}</span>
                </div>
                <div class="media-gallery media-gallery-cols-${colCount}">
                    ${galleryColsHtml}
                </div>
            </div>
        `;
    };

    // Soft pastel priority & status badge styles
    const priorityBadgeStyle =
        priorityLevel >= 3
            ? 'background:#fef2f2;color:#dc2626;border:1px solid #fecaca;'
            : priorityLevel === 2
                ? 'background:#fffbeb;color:#d97706;border:1px solid #fde68a;'
                : 'background:#f0f9ff;color:#0284c7;border:1px solid #bae6fd;';

    const lowerStatus = statusName.toLowerCase();
    const statusBadgeStyle =
        lowerStatus === 'completed' || lowerStatus === 'reconciled'
            ? 'background:#ecfdf5;color:#059669;border:1px solid #a7f3d0;'
            : lowerStatus === 'rejected'
                ? 'background:#fef2f2;color:#dc2626;border:1px solid #fecaca;'
                : lowerStatus === 'in progress' || lowerStatus === 'approved'
                    ? 'background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;'
                    : 'background:#fffbeb;color:#d97706;border:1px solid #fde68a;';

    // Section: Classification & Store
    const classificationSectionHtml = sections.classificationAndStore
        ? `
        <div class="section-block">
            <div class="section-header">
                <span class="section-num">${nextSectionNum()}</span>
                <h2 class="section-title">Ticket Classification &amp; Store / Location Details</h2>
            </div>
            <div class="two-col-grid">
                <div class="info-panel">
                    <div class="info-panel-title">Ticket &amp; Classification Details</div>
                    <table class="kv-table">
                        <tbody>
                            <tr>
                                <th>Work Order No</th>
                                <td class="font-mono">${escapeHtml(workOrderNo)} (Ticket ID: ${ticketId})</td>
                            </tr>
                            <tr>
                                <th>Ticket Title</th>
                                <td>${escapeHtml(ticketDetails.title)}</td>
                            </tr>
                            <tr>
                                <th>Department</th>
                                <td>${escapeHtml(deptName)}</td>
                            </tr>
                            <tr>
                                <th>Sub-Department</th>
                                <td>${escapeHtml(subDeptDisplay)}</td>
                            </tr>
                            <tr>
                                <th>Work Nature</th>
                                <td>${escapeHtml(natureName)}</td>
                            </tr>
                            <tr>
                                <th>Priority &amp; Status</th>
                                <td>${escapeHtml(priorityName)} Priority • Status: <strong>${escapeHtml(statusName)}</strong></td>
                            </tr>
                            <tr>
                                <th>Reported By</th>
                                <td>
                                    ${escapeHtml(createdByName)}
                                    ${createdByRole ? ` (${escapeHtml(createdByRole)})` : ''}
                                    ${createdByEmpNo ? ` • Emp ID: ${escapeHtml(createdByEmpNo)}` : ''}
                                    ${createdByPhone ? `<br/><span class="cell-sub">Phone: ${escapeHtml(createdByPhone)}</span>` : ''}
                                </td>
                            </tr>
                            <tr>
                                <th>Created Date</th>
                                <td>${escapeHtml(formatDateTime(ticketDetails.created_date))}</td>
                            </tr>
                            ${ticketDetails.device_info
            ? `
                            <tr>
                                <th>Created Device</th>
                                <td>${escapeHtml(ticketDetails.device_info)}</td>
                            </tr>
                            `
            : ''
        }
                        </tbody>
                    </table>
                </div>

                <div class="info-panel">
                    <div class="info-panel-title">Store / Location &amp; Contact Information</div>
                    <table class="kv-table">
                        <tbody>
                            <tr>
                                <th>Store Name</th>
                                <td><strong>${escapeHtml(storeName)}</strong></td>
                            </tr>
                            <tr>
                                <th>Store ID / Code</th>
                                <td class="font-mono">${escapeHtml(storeIdCode)}${storeType ? ` (${escapeHtml(storeType)})` : ''}</td>
                            </tr>
                            <tr>
                                <th>Area / Region</th>
                                <td>${escapeHtml(storeArea)}</td>
                            </tr>
                            <tr>
                                <th>Address</th>
                                <td>${escapeHtml(storeAddress)}</td>
                            </tr>
                            <tr>
                                <th>Store Manager</th>
                                <td>
                                    ${escapeHtml(storeManagerName)}
                                    ${storeManagerPhone ? `<br/><span class="cell-sub">Phone: ${escapeHtml(storeManagerPhone)}</span>` : ''}
                                </td>
                            </tr>
                            <tr>
                                <th>Location Phone</th>
                                <td>${escapeHtml(storePhone)}</td>
                            </tr>
                            ${storeCoords
            ? `
                            <tr>
                                <th>GPS Coordinates</th>
                                <td class="font-mono">${escapeHtml(storeCoords)}</td>
                            </tr>
                            `
            : ''
        }
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `
        : '';

    // Section: Issue Description
    const descriptionSectionHtml = sections.description
        ? `
        <div class="section-block">
            <div class="section-header">
                <span class="section-num">${nextSectionNum()}</span>
                <h2 class="section-title">Detailed Issue Description &amp; Scope of Work</h2>
            </div>
            <div class="description-box">${escapeHtml(ticketDetails.description || 'No description provided.')}</div>
        </div>
    `
        : '';

    // Section: Approvals & Sign-off
    const hasApprovalData = Boolean(
        ticketDetails.approved_by ||
        ticketDetails.rejected_by ||
        ticketDetails.location_approval ||
        ticketDetails.closed_by
    );

    const approvalsHtml =
        sections.approvals && hasApprovalData
            ? `
        <div class="section-block">
            <div class="section-header">
                <span class="section-num">${nextSectionNum()}</span>
                <h2 class="section-title">Approvals, Verification &amp; Resolution Status</h2>
            </div>
            <div class="approval-cards-grid">
                ${ticketDetails.approved_by
                ? `
                    <div class="approval-card approval-ok">
                        <div class="approval-label">✓ TICKET APPROVED BY</div>
                        <div class="approval-person">${escapeHtml(ticketDetails.approved_by.full_name)}</div>
                        <div class="approval-date">Date: ${escapeHtml(formatDateTime(ticketDetails.approved_date))}</div>
                    </div>
                `
                : ''
            }
                ${ticketDetails.rejected_by
                ? `
                    <div class="approval-card approval-err">
                        <div class="approval-label">✕ TICKET REJECTED BY</div>
                        <div class="approval-person">${escapeHtml(ticketDetails.rejected_by.full_name)}</div>
                        <div class="approval-date">Date: ${escapeHtml(formatDateTime(ticketDetails.rejected_date))}</div>
                        ${ticketDetails.reject_reason ? `<div class="approval-reason">Reason: "${escapeHtml(ticketDetails.reject_reason)}"</div>` : ''}
                    </div>
                `
                : ''
            }
                ${ticketDetails.location_approval
                ? `
                    <div class="approval-card ${ticketDetails.location_approval === 'Approved' ? 'approval-ok' : ticketDetails.location_approval === 'Rejected' ? 'approval-err' : 'approval-warn'}">
                        <div class="approval-label">STORE / LOCATION APPROVAL: ${escapeHtml(ticketDetails.location_approval.toUpperCase())}</div>
                        <div class="approval-person">${escapeHtml(ticketDetails.location_approved_by?.full_name || 'Store / Location Manager')}</div>
                        ${ticketDetails.location_approved_date ? `<div class="approval-date">Date: ${escapeHtml(formatDateTime(ticketDetails.location_approved_date))}</div>` : ''}
                        ${ticketDetails.location_reject_reason ? `<div class="approval-reason">Reason: "${escapeHtml(ticketDetails.location_reject_reason)}"</div>` : ''}
                    </div>
                `
                : ''
            }
                ${ticketDetails.closed_by
                ? `
                    <div class="approval-card approval-neutral">
                        <div class="approval-label">CLOSED BY</div>
                        <div class="approval-person">${escapeHtml(ticketDetails.closed_by.full_name)}</div>
                        <div class="approval-date">Date: ${escapeHtml(formatDateTime(ticketDetails.closed_date))}</div>
                    </div>
                `
                : ''
            }
            </div>
        </div>
    `
            : '';

    // Section: Allocated Personnel
    const allocationsRowsHtml =
        allocations && allocations.length > 0
            ? allocations
                .map((a, idx) => {
                    const wId = a.worker?.user_id;
                    const workerLogs = (workLogs || []).filter((wl) => wl.worker?.user_id === wId);
                    const workerLoggedHrs = workerLogs.reduce(
                        (s, wl) => s + (parseFloat(String(wl.hours || 0)) || 0),
                        0
                    );
                    const workerExps = (expenses || []).filter((ex) => ex.worker?.user_id === wId);
                    const workerExpSum = workerExps.reduce(
                        (s, ex) => s + (parseFloat(String(ex.amount || 0)) || 0),
                        0
                    );
                    const wRole =
                        typeof a.worker?.role === 'object' && a.worker?.role
                            ? a.worker.role.role_name
                            : '';
                    const wPhone = a.worker?.phone || a.worker?.whatsapp_number || '-';
                    const cleanEmpNo = String(a.worker?.employee_no || '').replace(/#/g, '');

                    return `
                        <tr>
                            <td class="text-center">${idx + 1}</td>
                            <td>
                                <strong>${escapeHtml(a.worker?.full_name || 'Technician')}</strong>
                                ${cleanEmpNo ? `<div class="cell-sub">Emp ID: ${escapeHtml(cleanEmpNo)}</div>` : ''}
                            </td>
                            <td>${escapeHtml(wRole || 'Technician')}</td>
                            <td>${escapeHtml(wPhone)}</td>
                            <td>
                                ${escapeHtml(a.assigned_by?.full_name || 'System')}
                                <div class="cell-sub">${escapeHtml(formatDateTime(a.assigned_date))}</div>
                            </td>
                            <td class="text-right font-mono">${parseFloat(String(a.planned_hours || 0)).toFixed(2)} hrs</td>
                            <td class="text-right font-mono">${workerLoggedHrs.toFixed(2)} hrs</td>
                            <td class="text-right font-mono">${workerExpSum.toFixed(3)} KWD</td>
                            <td>${escapeHtml(a.remarks || '-')}</td>
                        </tr>
                    `;
                })
                .join('')
            : `<tr><td colspan="9" class="empty-row">No technicians / personnel allocated to this ticket.</td></tr>`;

    const allocatedSectionHtml = sections.allocatedPersonnel
        ? `
        <div class="section-block">
            <div class="section-header">
                <span class="section-num">${nextSectionNum()}</span>
                <h2 class="section-title">Allocated Technicians &amp; Personnel (${allocations.length})</h2>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width:28px;" class="text-center">SL</th>
                        <th style="width:150px;">TECHNICIAN / WORKER</th>
                        <th style="width:95px;">ROLE</th>
                        <th style="width:85px;">CONTACT</th>
                        <th style="width:130px;">ASSIGNED BY &amp; DATE</th>
                        <th style="width:72px;" class="text-right">PLANNED</th>
                        <th style="width:72px;" class="text-right">LOGGED</th>
                        <th style="width:82px;" class="text-right">EXPENSES</th>
                        <th>WRITTEN REMARKS / INSTRUCTIONS</th>
                    </tr>
                </thead>
                <tbody>
                    ${allocationsRowsHtml}
                </tbody>
            </table>
        </div>
    `
        : '';

    // Section: Work Logs
    const workLogsRowsHtml =
        workLogs && workLogs.length > 0
            ? workLogs
                .map((wl, idx) => {
                    const timeRange =
                        wl.from_time && wl.to_time
                            ? `${String(wl.from_time).slice(0, 5)} – ${String(wl.to_time).slice(0, 5)}`
                            : '-';
                    const cleanEmpNo = String(wl.worker?.employee_no || '').replace(/#/g, '');
                    return `
                        <tr>
                            <td class="text-center">${idx + 1}</td>
                            <td>
                                <strong>${escapeHtml(wl.worker?.full_name || 'Technician')}</strong>
                                ${cleanEmpNo ? `<span class="cell-sub"> (ID: ${escapeHtml(cleanEmpNo)})</span>` : ''}
                            </td>
                            <td class="text-center">${escapeHtml(formatDateOnly(wl.work_date))}</td>
                            <td class="text-center font-mono">${escapeHtml(timeRange)}</td>
                            <td class="text-right font-mono"><strong>${parseFloat(String(wl.hours || 0)).toFixed(2)}h</strong></td>
                            <td class="text-right font-mono">${wl.hourly_rate ? `${parseFloat(String(wl.hourly_rate)).toFixed(3)}` : '-'}</td>
                            <td class="text-right font-mono"><strong>${parseFloat(String(wl.labour_amount || 0)).toFixed(3)} KWD</strong></td>
                            <td class="text-center">
                                <span class="mini-badge ${wl.is_claimed ? 'badge-claimed' : 'badge-unclaimed'}">
                                    ${wl.is_claimed ? 'Claimed' : 'Unclaimed'}
                                </span>
                            </td>
                            <td>${escapeHtml(wl.work_done || '-')}</td>
                        </tr>
                    `;
                })
                .join('')
            : `<tr><td colspan="9" class="empty-row">No work hours logged for this ticket.</td></tr>`;

    const workLogsSectionHtml = sections.workLogs
        ? `
        <div class="section-block">
            <div class="section-header">
                <span class="section-num">${nextSectionNum()}</span>
                <h2 class="section-title">Work Logs &amp; Labour Hours Breakdown (${workLogs.length})</h2>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width:28px;" class="text-center">SL</th>
                        <th style="width:140px;">TECHNICIAN</th>
                        <th style="width:80px;" class="text-center">WORK DATE</th>
                        <th style="width:95px;" class="text-center">TIME WINDOW</th>
                        <th style="width:65px;" class="text-right">HOURS</th>
                        <th style="width:65px;" class="text-right">RATE</th>
                        <th style="width:85px;" class="text-right">LABOUR COST</th>
                        <th style="width:75px;" class="text-center">CLAIM</th>
                        <th>WORK PERFORMED / DETAILS</th>
                    </tr>
                </thead>
                <tbody>
                    ${workLogsRowsHtml}
                </tbody>
                ${workLogs.length > 0
            ? `
                <tfoot>
                    <tr>
                        <td colspan="4" class="text-right">TOTAL LOGGED HOURS &amp; LABOUR AMOUNT:</td>
                        <td class="text-right font-mono">${totalLoggedHours.toFixed(2)}h</td>
                        <td></td>
                        <td class="text-right font-mono">${totalLabourCost.toFixed(3)} KWD</td>
                        <td colspan="2"></td>
                    </tr>
                </tfoot>
                `
            : ''
        }
            </table>
        </div>
    `
        : '';

    // Section: Expenses
    const expensesRowsHtml =
        expenses && expenses.length > 0
            ? expenses
                .map((exp, idx) => {
                    const claimStatus =
                        exp.claim_status ||
                        exp.claim_detail?.status ||
                        (typeof exp.claim === 'object' && exp.claim ? exp.claim.status : null);
                    const isPaid = Boolean(exp.is_paid || exp.status_display === 'Paid' || claimStatus === 'Paid');
                    const approveRequired =
                        exp.expense_type?.approve_required !== false &&
                        exp.expense_type_detail?.approve_required !== false;
                    const rawStatusText = isPaid
                        ? 'Paid'
                        : exp.approved || !approveRequired
                            ? 'Approved'
                            : exp.status_display ||
                                        (claimStatus === 'Rejected' || claimStatus === 'Rework'
                                            ? claimStatus
                                            : 'Pending Approval');
                    const statusText =
                        rawStatusText === 'Paid'
                            ? 'Paid & Settled'
                            : rawStatusText === 'Rework'
                                ? 'Rework Needed'
                                : rawStatusText;

                    const rejectReasonText =
                        exp.reject_reason ||
                        exp.claim_detail?.reject_reason ||
                        (exp.claim && (exp.claim.status === 'Rejected' || exp.claim.status === 'Rework')
                            ? exp.claim.reject_reason
                            : null);

                    const receiptCount =
                        (exp.receipt ? 1 : 0) +
                        (Array.isArray(exp.receipts)
                            ? exp.receipts.filter((r) => !exp.receipt || r.media_id !== exp.receipt.media_id).length
                            : 0);
                    const cleanEmpNo = String(exp.worker?.employee_no || '').replace(/#/g, '');

                    return `
                        <tr>
                            <td class="text-center">${idx + 1}</td>
                            <td class="text-center">${escapeHtml(formatDateOnly(exp.expense_date))}</td>
                            <td>
                                <strong>${escapeHtml(exp.worker?.full_name || 'Technician')}</strong>
                                ${cleanEmpNo ? `<div class="cell-sub">Emp ID: ${escapeHtml(cleanEmpNo)}</div>` : ''}
                            </td>
                            <td><strong>${escapeHtml(exp.expense_type?.expense_name || 'General Expense')}</strong></td>
                            <td>
                                ${escapeHtml(exp.remarks || '-')}
                                ${rejectReasonText ? `<div class="cell-sub" style="color:#b91c1c;">Reason: ${escapeHtml(rejectReasonText)}</div>` : ''}
                            </td>
                            <td class="text-center">${receiptCount > 0 ? `${receiptCount} file(s)` : 'None'}</td>
                            <td class="text-center">
                                <span class="mini-badge ${rawStatusText === 'Approved' || rawStatusText === 'Paid' ? 'badge-ok' : rawStatusText === 'Rejected' ? 'badge-err' : 'badge-warn'}">
                                    ${escapeHtml(statusText)}
                                </span>
                            </td>
                            <td class="text-center">
                                <span class="mini-badge ${exp.is_claimed ? 'badge-claimed' : 'badge-unclaimed'}">
                                    ${exp.is_claimed ? 'Claimed' : 'Unclaimed'}
                                </span>
                            </td>
                            <td class="text-right font-mono"><strong>${parseFloat(String(exp.amount || 0)).toFixed(3)} KWD</strong></td>
                        </tr>
                    `;
                })
                .join('')
            : `<tr><td colspan="9" class="empty-row">No financial expenses logged for this ticket.</td></tr>`;

    const expensesSectionHtml = sections.expenses
        ? `
        <div class="section-block">
            <div class="section-header">
                <span class="section-num">${nextSectionNum()}</span>
                <h2 class="section-title">Logged Financial Expenses &amp; Material Claims (${expenses.length})</h2>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width:28px;" class="text-center">SL</th>
                        <th style="width:80px;" class="text-center">DATE</th>
                        <th style="width:135px;">TECHNICIAN</th>
                        <th style="width:125px;">EXPENSE CATEGORY</th>
                        <th>REMARKS / DESCRIPTION</th>
                        <th style="width:65px;" class="text-center">RECEIPTS</th>
                        <th style="width:90px;" class="text-center">APPROVAL</th>
                        <th style="width:75px;" class="text-center">CLAIM</th>
                        <th style="width:90px;" class="text-right">AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    ${expensesRowsHtml}
                </tbody>
                ${expenses.length > 0
            ? `
                <tfoot>
                    <tr>
                        <td colspan="8" class="text-right">TOTAL TICKET EXPENSES AMOUNT:</td>
                        <td class="text-right font-mono">${totalExpensesAmount.toFixed(3)} KWD</td>
                    </tr>
                    ${totalLabourCost > 0
                ? `
                    <tr>
                        <td colspan="8" class="text-right">COMBINED TICKET COST (LABOUR + EXPENSES):</td>
                        <td class="text-right font-mono">${grandTotalCost.toFixed(3)} KWD</td>
                    </tr>
                    `
                : ''
            }
                </tfoot>
                `
            : ''
        }
            </table>
        </div>
    `
        : '';

    // Section: Visual Media
    const anyMediaSectionSelected = sections.beforeMedia || sections.afterMedia || sections.expenseMedia;
    const mediaSectionHtml = anyMediaSectionSelected
        ? processedMedia.length > 0
            ? `
        <div class="section-block">
            <div class="section-header">
                <span class="section-num">${nextSectionNum()}</span>
                <h2 class="section-title">Associated Visual Media (${processedMedia.length})</h2>
            </div>
            ${renderMediaGroupHtml(
                'Before Repair / Issue Documentation',
                'Condition media captured prior to maintenance repair work',
                '#eff6ff',
                '#1d4ed8',
                beforeMediaItems
            )}
            ${renderMediaGroupHtml(
                'After Repair / Completion Verification',
                'Post-repair media confirming work completion',
                '#ecfdf5',
                '#047857',
                afterMediaItems
            )}
            ${renderMediaGroupHtml(
                'Expense Receipts & Material Bills',
                'Supporting invoices, bills, and receipt images associated with logged ticket expenses',
                '#f5f3ff',
                '#6d28d9',
                expenseMediaItems
            )}
            ${renderMediaGroupHtml(
                'Additional Ticket Attachments',
                'Other visual media files linked to this work order',
                '#f1f5f9',
                '#475569',
                otherMediaItems
            )}
        </div>
    `
            : `
        <div class="section-block">
            <div class="section-header">
                <span class="section-num">${nextSectionNum()}</span>
                <h2 class="section-title">Associated Visual Media (0)</h2>
            </div>
            <div class="empty-box">No visual media files are attached for the selected categories.</div>
        </div>
    `
        : '';

    // Section: History Timeline
    const historySectionHtml =
        sections.historyTimeline && historyRecords.length > 0
            ? `
        <div class="section-block">
            <div class="section-header">
                <span class="section-num">${nextSectionNum()}</span>
                <h2 class="section-title">Ticket Audit &amp; Status Transition Timeline (${historyRecords.length})</h2>
            </div>
            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width:32px;" class="text-center">SL</th>
                        <th style="width:135px;">DATE &amp; TIME</th>
                        <th style="width:150px;">ACTION BY</th>
                        <th style="width:110px;">STATUS</th>
                        <th style="width:95px;">PRIORITY</th>
                        <th style="width:75px;" class="text-center">AGE</th>
                        <th>REMARKS / TRANSITION NOTES</th>
                    </tr>
                </thead>
                <tbody>
                    ${historyRecords
                .map(
                    (h, idx) => `
                        <tr>
                            <td class="text-center">${idx + 1}</td>
                            <td>${escapeHtml(formatDateTime(h.changed_date))}</td>
                            <td>
                                <strong>${escapeHtml(h.changed_by?.full_name || 'System Agent')}</strong>
                                ${h.changed_by?.role?.role_name ? `<div class="cell-sub">${escapeHtml(h.changed_by.role.role_name)}</div>` : ''}
                            </td>
                            <td><strong>${escapeHtml(h.status?.status_name || '-')}</strong></td>
                            <td>${escapeHtml(h.priority?.priority_name || '-')}</td>
                            <td class="text-center">${h.age_days != null ? `${Number(h.age_days).toFixed(1)}d` : '-'}</td>
                            <td>${escapeHtml(h.remarks || 'Status updated')}</td>
                        </tr>
                    `
                )
                .join('')}
                </tbody>
            </table>
        </div>
    `
            : '';

    // Construct Complete Dedicated Print HTML Document
    // Note: @page { margin: 0mm; } suppresses the browser's built-in header/footer URLs!
    const printHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title> </title>
    <style>
        @page {
            size: A4 portrait;
            margin: 0mm !important;
        }
        *, *::before, *::after {
            box-sizing: border-box;
        }
        html, body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #334155;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            font-size: 10px;
            line-height: 1.45;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        .document-container {
            width: 100%;
            max-width: 210mm;
            margin: 0 auto;
            padding: 0 11mm;
        }

        /* ── Reworked Top Section (Clean, Light, Modern) ── */
        .top-card {
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            background: #ffffff;
            overflow: hidden;
            margin-bottom: 12px;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .top-card-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 10px 14px;
            background: #e2e8f0;
            border-bottom: 1px solid #cbd5e1;
        }
        .brand-identity {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .brand-logo {
            height: 48px;
            width: auto;
            max-width: 170px;
            object-fit: contain;
        }
        .doc-type-label {
            font-size: 8px;
            font-weight: 700;
            letter-spacing: 0.8px;
            text-transform: uppercase;
            color: #94a3b8;
            margin: 0;
        }
        .doc-wo-number {
            font-size: 14px;
            font-weight: 800;
            color: #1e293b;
            margin: 0;
            letter-spacing: -0.2px;
        }
        .badge-strip {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
        }
        .header-badge {
            display: inline-flex;
            align-items: center;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 8.5px;
            font-weight: 700;
            letter-spacing: 0.2px;
        }
        .id-badge {
            background: #ffffff;
            color: #475569;
            border: 1px solid #cbd5e1;
        }
        .top-card-body {
            display: flex;
            align-items: stretch;
            justify-content: space-between;
            gap: 14px;
            padding: 12px 14px;
        }
        .top-card-left {
            flex: 1;
            min-width: 0;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            gap: 10px;
        }
        .doc-ticket-subject {
            font-size: 13.5px;
            font-weight: 700;
            color: #1e293b;
            margin: 0;
            line-height: 1.35;
        }
        .top-meta-strip {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
        }
        .top-meta-cell {
            background: #f8fafc;
            border: 1px solid #f1f5f9;
            border-radius: 4px;
            padding: 5px 8px;
        }
        .top-meta-label {
            font-size: 7.5px;
            font-weight: 700;
            text-transform: uppercase;
            color: #94a3b8;
            letter-spacing: 0.3px;
            display: block;
        }
        .top-meta-val {
            font-size: 9px;
            font-weight: 700;
            color: #334155;
            margin-top: 1px;
            display: block;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .qr-panel {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border: 1px solid #f1f5f9;
            border-radius: 4px;
            background: #f8fafc;
            padding: 6px 8px;
            shrink: 0;
        }

        /* ── KPI Summary Strip ── */
        .kpi-strip {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 8px;
            margin-bottom: 12px;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .kpi-card {
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 6px 8px;
            background: #fcfcfd;
        }
        .kpi-label {
            font-size: 7.5px;
            font-weight: 700;
            text-transform: uppercase;
            color: #94a3b8;
            letter-spacing: 0.3px;
            display: block;
        }
        .kpi-value {
            font-size: 11px;
            font-weight: 800;
            color: #334155;
            margin-top: 2px;
            display: block;
        }
        .kpi-sub {
            font-size: 7.5px;
            color: #64748b;
            display: block;
        }

        /* ── Section Blocks (Main Headings) ── */
        .section-block {
            margin-bottom: 12px;
        }
        .section-header {
            display: flex;
            align-items: center;
            gap: 8px;
            background: #e2e8f0;
            color: #1e293b;
            border: 1px solid #cbd5e1;
            padding: 5px 10px;
            border-radius: 4px;
            margin-bottom: 8px;
            page-break-after: avoid;
            break-after: avoid;
        }
        .section-num {
            background: #ffffff;
            color: #2563eb;
            border: 1px solid #cbd5e1;
            font-size: 8px;
            font-weight: 700;
            padding: 1px 5px;
            border-radius: 4px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        .section-title {
            font-size: 9.5px;
            font-weight: 700;
            letter-spacing: 0.4px;
            text-transform: uppercase;
            color: #1e293b;
            margin: 0;
        }

        /* ── Two-Column Info Cards ── */
        .two-col-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .info-panel {
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            overflow: hidden;
            background: #ffffff;
        }
        .info-panel-title {
            background: #e2e8f0;
            border-bottom: 1px solid #cbd5e1;
            padding: 5px 10px;
            font-size: 8.5px;
            font-weight: 700;
            text-transform: uppercase;
            color: #334155;
            letter-spacing: 0.4px;
        }
        .kv-table {
            width: 100%;
            border-collapse: collapse;
        }
        .kv-table tr {
            border-bottom: 1px solid #f1f5f9;
        }
        .kv-table tr:last-child {
            border-bottom: none;
        }
        .kv-table th {
            width: 38%;
            text-align: left;
            padding: 4.5px 10px;
            font-size: 8.5px;
            font-weight: 600;
            color: #64748b;
            background: #fcfcfd;
            vertical-align: top;
        }
        .kv-table td {
            padding: 4.5px 10px;
            font-size: 9px;
            font-weight: 600;
            color: #334155;
            vertical-align: top;
            word-break: break-word;
        }

        /* ── Description Box ── */
        .description-box {
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 10px 12px;
            background: #fcfcfd;
            font-size: 10px;
            color: #334155;
            white-space: pre-wrap;
            word-break: break-word;
            line-height: 1.55;
            page-break-inside: avoid;
            break-inside: avoid;
        }

        /* ── Approvals Grid ── */
        .approval-cards-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .approval-card {
            border-radius: 4px;
            padding: 8px 10px;
            border: 1px solid #e2e8f0;
        }
        .approval-ok {
            background: #f0fdf4;
            border-color: #bbf7d0;
        }
        .approval-err {
            background: #fef2f2;
            border-color: #fecaca;
        }
        .approval-warn {
            background: #fffbeb;
            border-color: #fde68a;
        }
        .approval-neutral {
            background: #f8fafc;
            border-color: #e2e8f0;
        }
        .approval-label {
            font-size: 8px;
            font-weight: 700;
            letter-spacing: 0.4px;
            color: #475569;
            margin-bottom: 2px;
        }
        .approval-person {
            font-size: 10px;
            font-weight: 700;
            color: #1e293b;
        }
        .approval-date {
            font-size: 8px;
            color: #64748b;
        }
        .approval-reason {
            margin-top: 3px;
            font-size: 8.5px;
            font-style: italic;
            color: #991b1b;
        }

        /* ── Data Tables ── */
        .data-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #e2e8f0;
            background: #ffffff;
        }
        .data-table thead tr {
            background: #e2e8f0;
            border-bottom: 1px solid #cbd5e1;
        }
        .data-table th {
            padding: 5px 6px;
            font-size: 8px;
            font-weight: 700;
            text-transform: uppercase;
            color: #334155;
            border: 1px solid #cbd5e1;
            text-align: left;
            letter-spacing: 0.2px;
        }
        .data-table td {
            padding: 5px 6px;
            font-size: 9px;
            color: #334155;
            border: 1px solid #f1f5f9;
            vertical-align: top;
        }
        .data-table tbody tr {
            page-break-inside: avoid;
            break-inside: avoid;
        }
        .data-table tbody tr:nth-child(even) {
            background: #fcfcfd;
        }
        .data-table tfoot tr {
            background: #f8fafc;
            border-top: 1px solid #cbd5e1;
            font-weight: 700;
        }
        .data-table tfoot td {
            padding: 5px 6px;
            font-size: 9px;
            color: #1e293b;
            border: 1px solid #e2e8f0;
        }
        .cell-sub {
            font-size: 8px;
            color: #64748b;
            margin-top: 1px;
        }
        .text-center { text-align: center !important; }
        .text-right { text-align: right !important; }
        .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .empty-row {
            text-align: center !important;
            padding: 10px !important;
            color: #94a3b8 !important;
            font-style: italic;
        }
        .empty-box {
            border: 1px dashed #cbd5e1;
            border-radius: 4px;
            padding: 12px;
            text-align: center;
            color: #94a3b8;
            font-style: italic;
            background: #fcfcfd;
        }
        .mini-badge {
            display: inline-block;
            padding: 1.5px 6px;
            border-radius: 4px;
            font-size: 8px;
            font-weight: 700;
            white-space: nowrap;
        }
        .badge-ok { background: #dcfce7; color: #166534; }
        .badge-err { background: #fee2e2; color: #991b1b; }
        .badge-warn { background: #fef3c7; color: #92400e; }
        .badge-claimed { background: #f3e8ff; color: #6b21a8; }
        .badge-unclaimed { background: #f1f5f9; color: #475569; }

        /* ── Visual Media Section (Masonry Gallery for Variable Aspect Ratio Images) ── */
        .media-group-section {
            margin-bottom: 12px;
        }
        .media-group-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #e2e8f0;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            padding: 5px 10px;
            margin-bottom: 8px;
            page-break-after: avoid;
            break-after: avoid;
        }
        .media-group-title {
            font-size: 9px;
            font-weight: 700;
            color: #1e293b;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 0.3px;
        }
        .media-group-subtitle {
            font-size: 7.5px;
            color: #475569;
            margin: 1px 0 0 0;
        }
        .media-group-count {
            font-size: 8px;
            font-weight: 700;
            background: #ffffff;
            color: #334155;
            border: 1px solid #cbd5e1;
            padding: 2px 8px;
            border-radius: 4px;
        }
        .media-gallery {
            display: grid;
            gap: 8px;
            align-items: start;
        }
        .media-gallery-cols-2 {
            grid-template-columns: repeat(2, 1fr);
        }
        .media-gallery-cols-3 {
            grid-template-columns: repeat(3, 1fr);
        }
        .media-gallery-col {
            display: flex;
            flex-direction: column;
            gap: 8px;
            min-width: 0;
        }
        .media-card {
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            overflow: hidden;
            background: #ffffff;
            page-break-inside: avoid;
            break-inside: avoid;
            display: flex;
            flex-direction: column;
        }
        .media-thumb-box {
            position: relative;
            width: 100%;
            background: #f8fafc;
            display: block;
            overflow: hidden;
            border-bottom: 1px solid #e2e8f0;
            line-height: 0;
        }
        .media-thumb-box img,
        .media-thumb-box video {
            width: 100%;
            height: auto;
            max-height: 320px;
            object-fit: contain;
            display: block;
            margin: 0 auto;
        }
        .media-card-body {
            padding: 6px 9px;
            font-size: 8.5px;
            display: flex;
            flex-direction: column;
            gap: 3px;
        }
        .media-card-title-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 6px;
        }
        .media-cat-tag {
            font-size: 7.5px;
            font-weight: 700;
            padding: 1.5px 6px;
            border-radius: 4px;
            text-transform: uppercase;
        }
        .media-date-tag {
            font-size: 7.5px;
            color: #94a3b8;
        }
        .media-expense-meta {
            font-size: 8px;
            color: #6d28d9;
            background: #f5f3ff;
            padding: 2px 5px;
            border-radius: 4px;
            border: 1px solid #ede9fe;
        }
        .media-meta-footer {
            color: #64748b;
            font-size: 8px;
        }

        /* ── Document Footer (Pinned to Page Bottom) ── */
        .print-layout-table {
            width: 100%;
            border-collapse: collapse;
            border: none;
        }
        .print-layout-table > thead > tr > td,
        .print-layout-table > tbody > tr > td,
        .print-layout-table > tfoot > tr > td {
            border: none;
            padding: 0;
        }
        .page-top-spacer {
            height: 10mm;
        }
        .page-bottom-spacer {
            height: 14mm;
        }
        .doc-footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 6px 11mm 6mm 11mm;
            background: #ffffff;
            border-top: 1px solid #cbd5e1;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 8px;
            color: #64748b;
            z-index: 50;
            page-break-inside: avoid;
            break-inside: avoid;
        }
    </style>
</head>
<body>
    <!-- Pinned Bottom Page Footer (NO URL) -->
    <div class="doc-footer">
        <span>Work Order: <strong>${escapeHtml(workOrderNo)}</strong> (Ticket ID: ${ticketId})</span>
        <span>Store: <strong>${escapeHtml(storeName)}</strong> • Department: <strong>${escapeHtml(deptName)}</strong></span>
    </div>

    <div class="document-container">
        <table class="print-layout-table">
            <thead>
                <tr>
                    <td>
                        <div class="page-top-spacer"></div>
                    </td>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>
                        <!-- 1. REWORKED LIGHT TOP HEADER -->
        <div class="top-card">
            <div class="top-card-bar">
                <div class="brand-identity">
                    <img src="${origin}/document_logo.png" class="brand-logo" onerror="this.style.display='none'" alt="Logo" />
                    <div>
                        <p class="doc-type-label">Maintenance Ticket Report</p>
                        <h1 class="doc-wo-number">${escapeHtml(workOrderNo)}</h1>
                    </div>
                </div>
                <div class="badge-strip">
                    <span class="header-badge id-badge">Ticket ID: ${ticketId}</span>
                    <span class="header-badge" style="${statusBadgeStyle}">${escapeHtml(statusName)}</span>
                    <span class="header-badge" style="${priorityBadgeStyle}">${escapeHtml(priorityName)} Priority</span>
                </div>
            </div>

            <div class="top-card-body">
                <div class="top-card-left">
                    <p class="doc-ticket-subject">${escapeHtml(ticketDetails.title)}</p>
                    <div class="top-meta-strip">
                        <div class="top-meta-cell">
                            <span class="top-meta-label">Store / Location</span>
                            <span class="top-meta-val">${escapeHtml(storeName)} (${escapeHtml(storeIdCode)})</span>
                        </div>
                        <div class="top-meta-cell">
                            <span class="top-meta-label">Department</span>
                            <span class="top-meta-val">${escapeHtml(deptName)}</span>
                        </div>
                        <div class="top-meta-cell">
                            <span class="top-meta-label">Created On</span>
                            <span class="top-meta-val">${escapeHtml(formatDateTime(ticketDetails.created_date))}</span>
                        </div>
                        <div class="top-meta-cell">
                            <span class="top-meta-label">Printed By</span>
                            <span class="top-meta-val">${escapeHtml(printedByUser)}</span>
                        </div>
                    </div>
                </div>

                ${sections.qrCode
            ? `
                <div class="qr-panel">
                    ${qrCodeSvg}
                </div>
                `
            : ''
        }
            </div>
        </div>

        <!-- 2. KPI SUMMARY STRIP -->
        ${sections.kpiSummary
            ? `
        <div class="kpi-strip">
            <div class="kpi-card">
                <span class="kpi-label">Ticket Age</span>
                <span class="kpi-value">${escapeHtml(calculatedAgeDays)}</span>
                <span class="kpi-sub">${escapeHtml(formatDateOnly(ticketDetails.created_date))}</span>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Allocated Staff</span>
                <span class="kpi-value">${allocations.length} Tech(s)</span>
                <span class="kpi-sub">Planned: ${totalPlannedHours.toFixed(1)} hrs</span>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Logged Hours</span>
                <span class="kpi-value">${totalLoggedHours.toFixed(2)} hrs</span>
                <span class="kpi-sub">${workLogs.length} Work Log(s)</span>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Labour Cost</span>
                <span class="kpi-value">${totalLabourCost.toFixed(3)} KWD</span>
                <span class="kpi-sub">Logged Labour</span>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Expenses / Bills</span>
                <span class="kpi-value">${totalExpensesAmount.toFixed(3)} KWD</span>
                <span class="kpi-sub">${expenses.length} Expense Item(s)</span>
            </div>
            <div class="kpi-card">
                <span class="kpi-label">Visual Media</span>
                <span class="kpi-value">${processedMedia.length} File(s)</span>
                <span class="kpi-sub">Attached Media</span>
            </div>
        </div>
        `
            : ''
        }

        ${classificationSectionHtml}
        ${descriptionSectionHtml}
        ${approvalsHtml}
        ${allocatedSectionHtml}
        ${workLogsSectionHtml}
        ${expensesSectionHtml}
        ${mediaSectionHtml}
        ${historySectionHtml}
                    </td>
                </tr>
            </tbody>
            <tfoot>
                <tr>
                    <td>
                        <div class="page-bottom-spacer"></div>
                    </td>
                </tr>
            </tfoot>
        </table>
    </div>
    ${isPreview
            ? `
    <style>
        html, body {
            background: transparent !important;
            overflow-x: hidden;
            margin: 0;
            padding: 0;
        }
        .doc-footer {
            display: none;
        }
        #preview-scale-root {
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            padding: 4px 0 24px 0;
        }
        .a4-sheet-wrapper {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .a4-sheet-meta {
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
            font-weight: 700;
            color: #64748b;
            margin-bottom: 6px;
            padding: 0 2px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
        }
        .a4-sheet-frame {
            position: relative;
            overflow: hidden;
            border: 1px solid #cbd5e1;
            border-radius: 4px;
            box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
            background: #ffffff;
        }
        .a4-preview-sheet {
            width: 794px;
            height: 1123px;
            background: #ffffff;
            padding: 10mm 11mm 16mm 11mm;
            position: absolute;
            top: 0;
            left: 0;
            transform-origin: top left;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            overflow: hidden;
        }
        .a4-sheet-footer {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 6px 11mm 6mm 11mm;
            background: #ffffff;
            border-top: 1px solid #cbd5e1;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 8px;
            color: #64748b;
        }
    </style>
    <script>
        (function() {
            var footerInnerHtml = document.querySelector('.doc-footer') ? document.querySelector('.doc-footer').innerHTML : '';
            var rawCell = document.querySelector('.print-layout-table > tbody > tr > td');
            if (!rawCell) return;

            // Collect atomic blocks for accurate A4 pagination
            var sourceNodes = [];
            Array.from(rawCell.children).forEach(function(el) {
                var mediaGroups = el.querySelectorAll('.media-group-section');
                if (mediaGroups.length > 0) {
                    var secHdr = el.querySelector('.section-header');
                    mediaGroups.forEach(function(mg, idx) {
                        var wrapper = document.createElement('div');
                        wrapper.className = 'section-block';
                        if (idx === 0 && secHdr) {
                            wrapper.appendChild(secHdr.cloneNode(true));
                        }
                        wrapper.appendChild(mg.cloneNode(true));
                        sourceNodes.push(wrapper);
                    });
                } else {
                    sourceNodes.push(el.cloneNode(true));
                }
            });

            var docContainer = document.querySelector('.document-container');
            if (docContainer) docContainer.style.display = 'none';

            var scaleRoot = document.createElement('div');
            scaleRoot.id = 'preview-scale-root';
            document.body.appendChild(scaleRoot);

            // Hidden staging container with exact A4 inner width (794px - 22mm = ~710px)
            var staging = document.createElement('div');
            staging.style.position = 'absolute';
            staging.style.visibility = 'hidden';
            staging.style.pointerEvents = 'none';
            staging.style.left = '-9999px';
            staging.style.top = '0';
            staging.style.width = '710px';
            document.body.appendChild(staging);

            sourceNodes.forEach(function(node) {
                staging.appendChild(node);
            });

            // Usable A4 height: 1123px - 10mm (38px) top - 16mm (60px) bottom = 1025px
            var MAX_PAGE_HEIGHT = 1020;

            function buildPaginatedSheets() {
                var pages = [[]];
                var currentHeight = 0;

                sourceNodes.forEach(function(node) {
                    var h = node.offsetHeight + 12;
                    if (pages[pages.length - 1].length > 0 && (currentHeight + h) > MAX_PAGE_HEIGHT) {
                        pages.push([node]);
                        currentHeight = h;
                    } else {
                        pages[pages.length - 1].push(node);
                        currentHeight += h;
                    }
                });

                scaleRoot.innerHTML = '';
                pages.forEach(function(pageNodes, idx) {
                    var wrap = document.createElement('div');
                    wrap.className = 'a4-sheet-wrapper';

                    var meta = document.createElement('div');
                    meta.className = 'a4-sheet-meta';
                    meta.innerHTML = '<span>Page ' + (idx + 1) + ' of ' + pages.length + '</span><span>A4 Portrait</span>';
                    wrap.appendChild(meta);

                    var frame = document.createElement('div');
                    frame.className = 'a4-sheet-frame';

                    var sheet = document.createElement('div');
                    sheet.className = 'a4-preview-sheet';

                    var contentBox = document.createElement('div');
                    pageNodes.forEach(function(n) {
                        contentBox.appendChild(n.cloneNode(true));
                    });
                    sheet.appendChild(contentBox);

                    var ftr = document.createElement('div');
                    ftr.className = 'a4-sheet-footer';
                    ftr.innerHTML = footerInnerHtml;
                    sheet.appendChild(ftr);

                    frame.appendChild(sheet);
                    wrap.appendChild(frame);
                    scaleRoot.appendChild(wrap);
                });

                // Seek any video elements in the visible sheets to starting frame
                Array.from(scaleRoot.querySelectorAll('video')).forEach(function(v) {
                    try { v.currentTime = 0.05; } catch(e) {}
                    v.addEventListener('loadedmetadata', function() {
                        try { v.currentTime = 0.05; } catch(e) {}
                    }, { once: true });
                });

                applyResponsiveScale();
            }

            function applyResponsiveScale() {
                var vw = document.documentElement.clientWidth || window.innerWidth || 500;
                var vh = document.documentElement.clientHeight || window.innerHeight || 520;
                // Fit the ENTIRE vertical A4 Portrait sheet (794x1123) inside both available width and height
                var scaleW = Math.max(200, vw - 24) / 794;
                var scaleH = Math.max(280, vh - 38) / 1123;
                var scale = Math.min(scaleW, scaleH, 0.58);
                var scaledW = Math.round(794 * scale);
                var scaledH = Math.round(1123 * scale);

                Array.from(scaleRoot.querySelectorAll('.a4-sheet-wrapper')).forEach(function(wrap) {
                    wrap.style.width = scaledW + 'px';
                });
                Array.from(scaleRoot.querySelectorAll('.a4-sheet-frame')).forEach(function(frame) {
                    frame.style.width = scaledW + 'px';
                    frame.style.height = scaledH + 'px';
                });
                Array.from(scaleRoot.querySelectorAll('.a4-preview-sheet')).forEach(function(sheet) {
                    sheet.style.transform = 'scale(' + scale + ')';
                });
            }

            buildPaginatedSheets();

            // Re-paginate as images & videos finish loading their real dimensions
            var mediaEls = staging.querySelectorAll('img, video');
            mediaEls.forEach(function(m) {
                m.addEventListener('load', buildPaginatedSheets);
                m.addEventListener('loadedmetadata', buildPaginatedSheets);
                m.addEventListener('loadeddata', buildPaginatedSheets);
            });
            window.addEventListener('resize', applyResponsiveScale);
            setTimeout(buildPaginatedSheets, 350);
            setTimeout(buildPaginatedSheets, 1000);
        })();
    </script>
    `
            : ''
        }
</body>
</html>`;

    return printHtml;
}

export async function printTicketDetailsReport(options: PrintTicketOptions): Promise<void> {
    const printHtml = await buildTicketPrintHtml({ ...options, isPreview: false });

    // 6. Render into an off-screen iframe, wait for all images AND video starting frames to load, and invoke print()
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

        const waitForMediaAndPrint = () => {
            try {
                const imgs = Array.from(win.document.images || []);
                const videos = Array.from(win.document.querySelectorAll('video'));
                const totalMedia = imgs.length + videos.length;

                if (totalMedia === 0) {
                    setTimeout(triggerPrint, 150);
                    return;
                }

                let remaining = totalMedia;
                const onMediaDone = () => {
                    remaining -= 1;
                    if (remaining <= 0) {
                        setTimeout(triggerPrint, 200);
                    }
                };

                imgs.forEach((img) => {
                    if (img.complete) {
                        onMediaDone();
                    } else {
                        img.addEventListener('load', onMediaDone, { once: true });
                        img.addEventListener('error', onMediaDone, { once: true });
                    }
                });

                videos.forEach((vid) => {
                    let vidDone = false;
                    const markVidDone = () => {
                        if (vidDone) return;
                        vidDone = true;
                        onMediaDone();
                    };

                    if (vid.readyState >= 2) {
                        try {
                            vid.currentTime = 0.05;
                        } catch {
                            // ignore
                        }
                        markVidDone();
                    } else {
                        vid.addEventListener(
                            'loadeddata',
                            () => {
                                try {
                                    vid.currentTime = 0.05;
                                } catch {
                                    markVidDone();
                                }
                            },
                            { once: true }
                        );
                        vid.addEventListener('seeked', markVidDone, { once: true });
                        vid.addEventListener('error', markVidDone, { once: true });
                    }
                });

                setTimeout(triggerPrint, 3200);
            } catch {
                setTimeout(triggerPrint, 250);
            }
        };

        iframe.onload = waitForMediaAndPrint;
        if (win.document.readyState === 'complete') {
            waitForMediaAndPrint();
        }
    });
}
