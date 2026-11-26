import React, { useState, useRef, useEffect } from 'react';
import { Eye, FileText, Trash2, Headphones, X, Download, Play, Pause, Image as ImageIcon, Video, RotateCcw, RotateCw, RefreshCw, Save, Check, Loader2, Volume2, VolumeX, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ZoomableImage } from '@/components/ZoomableImage';
import { MEDIA_BASE, getMediaUrl } from '@/utils/media';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
export { MEDIA_BASE, getMediaUrl };

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface UserStub {
    user_id: number;
    full_name: string;
    employee_no?: string | null;
    profile_image?: string | null;
    phone?: string | null;
    whatsapp_number?: string | null;
    role?: { role_id: number; role_name: string } | null;
}

export interface Ticket {
    ticket_id: number;
    work_order_no: string;
    store: {
        store_id: string;
        store_name: string;
        type?: string | null;
        latitude?: number | string | null;
        longitude?: number | string | null;
        area?: { area_id?: number; area_name?: string } | string | null;
        address?: string | null;
        manager?: any;
        phone?: string | null;
        whatsapp_number?: string | null;
    };
    department: { department_id: number; department_name: string };
    nature: { nature_id: number; nature_name: string };
    priority: { priority_id: number; priority_name: string; level: number };
    status: { status_id: number; status_name: string; order: number };
    title: string;
    description: string;
    created_by: UserStub;
    created_date: string;
    approved_by?: UserStub | null;
    approved_date?: string | null;
    rejected_by?: UserStub | null;
    rejected_date?: string | null;
    reject_reason?: string | null;
    closed_by?: UserStub | null;
    closed_date?: string | null;
    allocations?: Allocation[];
    age_days?: number | null;
    location_approval?: string | null;
    location_approved_by?: UserStub | null;
    location_approved_date?: string | null;
    location_reject_reason?: string | null;
    device_info?: string | null;
}

export interface Allocation {
    allocation_id: number;
    worker: UserStub;
    assigned_by: UserStub;
    assigned_date: string;
    planned_hours: string;
    remarks: string;
    voice_note?: string | null;
}

export interface WorkLog {
    worklog_id: number;
    worker: UserStub;
    work_date: string;
    from_time?: string | null;
    to_time?: string | null;
    hours: string;
    hourly_rate: string;
    labour_amount: string;
    work_done: string;
    is_claimed?: boolean;
    claim?: any;
}

export interface Expense {
    expense_id: number;
    worker: UserStub;
    expense_type: { expense_type_id: number; expense_name: string; parent?: { expense_name: string } | null; required?: boolean; approve_required?: boolean; default_fill?: boolean; default_fill_template?: string };
    expense_type_detail?: { expense_type_id?: number; expense_name?: string; approve_required?: boolean; default_fill?: boolean; default_fill_template?: string };
    amount: string;
    expense_date: string;
    remarks: string;
    approved: boolean;
    receipt?: Media | null;
    receipts?: Media[] | null;
    is_claimed?: boolean;
    claim?: any;
    claim_status?: string | null;
    claim_detail?: { claim_id: number; status: string; reject_reason?: string | null } | null;
    is_paid?: boolean;
    status_display?: string;
    reject_reason?: string | null;
    approval_instances?: any[];
    current_step_name?: string | null;
    has_current_user_approved?: boolean;
    is_actionable_by_me?: boolean;
}

export interface MediaCategory {
    category_id: number;
    category_name: string;
    department?: { department_id: number; department_name: string } | null;
}

export interface Media {
    media_id: number;
    file_name: string;
    file_url: string;
    rotation?: number;
    uploaded_by: UserStub;
    uploaded_date: string;
    category: MediaCategory | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name);
export const isAudio = (name: string) => name.toLowerCase().includes('voice_note') || name.toLowerCase().includes('recording') || /\.(mp3|wav|ogg|m4a|aac)$/i.test(name);
export const isVideo = (name: string) => !isAudio(name) && /\.(mp4|mov|avi|mkv|webm)$/i.test(name);

// ─── Reusable Components ──────────────────────────────────────────────────────

export const AvatarCircle: React.FC<{
    user?: any;
    name?: string;
    image?: string | null;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    className?: string;
}> = ({ user, name, image, size = 'md', className = '' }) => {
    const [imgError, setImgError] = useState(false);
    const sizeClass = {
        xs: 'w-5 h-5 text-[9px]',
        sm: 'w-7 h-7 text-[10px]',
        md: 'w-9 h-9 text-xs',
        lg: 'w-12 h-12 text-sm'
    }[size];
    const profileImg = image !== undefined ? image : (user?.profile_image || (typeof user === 'object' ? user?.profile_image : null));
    const imgUrl = profileImg && !imgError ? getMediaUrl(profileImg) : null;
    const displayName = name || user?.full_name || user?.name || user?.username || '';
    const initials = displayName
        ? displayName.split(' ').filter(Boolean).map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
        : '?';

    return (
        <div className={`${sizeClass} rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold bg-primary/20 text-primary border border-primary/30 shadow-2xs ${className}`}>
            {imgUrl ? (
                <img
                    src={imgUrl}
                    alt={displayName || 'User'}
                    className="w-full h-full object-cover"
                    onError={() => setImgError(true)}
                />
            ) : (
                <span>{initials}</span>
            )}
        </div>
    );
};

export interface MediaGridProps {
    items: Media[];
    emptyLabel: string;
    onEdit?: (mediaId: number) => void;
    onDelete?: (mediaId: number) => void;
    token?: string | null;
    onRefreshTicket?: () => void;
    minNonAudioCount?: number;
    minNonAudioWarning?: string;
}

// ─── Compact Audio Card Component for Small Grid Cells ───────────────────────

const AudioGridCard: React.FC<{
    url: string;
    fileName: string;
    uploader?: any;
    onDelete?: () => void;
    onSelectPreview?: () => void;
}> = ({ url, fileName, uploader, onDelete, onSelectPreview }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const togglePlay = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play();
            setIsPlaying(true);
        }
    };

    return (
        <div
            onClick={onSelectPreview}
            className="relative aspect-video bg-primary/5 dark:bg-primary/10 rounded-lg overflow-hidden border border-primary/20 flex flex-col items-center justify-center p-2 group cursor-pointer hover:border-primary transition-colors"
        >
            <audio
                ref={audioRef}
                src={url}
                onEnded={() => setIsPlaying(false)}
                onPause={() => setIsPlaying(false)}
                className="hidden"
            />
            {uploader && (
                <div className="absolute top-1 left-1 z-20 pointer-events-none" title={`Uploaded by ${uploader.full_name}`}>
                    <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center font-bold text-[8px] bg-black/70 text-white border border-white/40 shadow-xs">
                        {uploader.profile_image ? (
                            <img src={getMediaUrl(uploader.profile_image)} alt={uploader.full_name} className="w-full h-full object-cover" />
                        ) : (
                            <span>{uploader.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'}</span>
                        )}
                    </div>
                </div>
            )}

            <button
                type="button"
                onClick={togglePlay}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isPlaying
                    ? 'bg-primary text-on-primary scale-110 shadow-md animate-pulse'
                    : 'bg-primary/20 hover:bg-primary text-primary hover:text-on-primary'
                    }`}
                title={isPlaying ? "Pause Voice Note" : "Play Voice Note"}
            >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </button>

            <span className="text-[9px] font-semibold text-primary dark:text-primary-light mt-1 truncate max-w-full px-1 flex items-center gap-1">
                <Headphones className="w-2.5 h-2.5 shrink-0" />
                {isPlaying ? 'Playing...' : 'Voice Note'}
            </span>

            {onDelete && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (isPlaying && audioRef.current) audioRef.current.pause();
                        onDelete();
                    }}
                    className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-red-600 text-white rounded transition-colors z-20"
                    title="Delete file"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            )}
            <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5 text-[8px] text-white truncate pointer-events-none">{fileName}</div>
        </div>
    );
};

export const RotatableVideoPlayer: React.FC<{
    src: string;
    rotation?: number;
    className?: string;
    autoPlay?: boolean;
    controls?: boolean;
}> = ({ src, rotation = 0, className = '', autoPlay = false, controls = true }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(autoPlay);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => setCurrentTime(video.currentTime);
        const handleLoadedMetadata = () => setDuration(video.duration || 0);
        const handleEnded = () => setIsPlaying(false);

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('loadedmetadata', handleLoadedMetadata);
        video.addEventListener('ended', handleEnded);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('loadedmetadata', handleLoadedMetadata);
            video.removeEventListener('ended', handleEnded);
        };
    }, [src]);

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (isPlaying) {
            video.pause();
            setIsPlaying(false);
        } else {
            video.play();
            setIsPlaying(true);
        }
    };

    const toggleMute = () => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = !isMuted;
        setIsMuted(!isMuted);
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const video = videoRef.current;
        if (!video) return;
        const newTime = parseFloat(e.target.value);
        video.currentTime = newTime;
        setCurrentTime(newTime);
    };

    const formatTime = (seconds: number) => {
        if (!seconds || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    if ((rotation % 360 === 0) && controls) {
        return (
            <video
                src={src}
                controls
                autoPlay={autoPlay}
                className={className}
            />
        );
    }

    const isRotatedVertical = rotation % 180 !== 0;

    return (
        <div className={`relative flex flex-col items-center justify-center bg-black/90 rounded-xl overflow-hidden ${className}`}>
            <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden p-2 min-h-[220px]">
                <video
                    ref={videoRef}
                    src={src}
                    autoPlay={autoPlay}
                    playsInline
                    muted={isMuted}
                    onClick={togglePlay}
                    style={{
                        transform: `rotate(${rotation}deg) scale(${isRotatedVertical ? 0.7 : 1})`,
                        transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                    className="max-w-full max-h-[65vh] object-contain cursor-pointer select-none"
                />
            </div>

            {controls && (
                <div className="w-full bg-black/85 backdrop-blur-md px-3 py-2 border-t border-white/10 flex items-center gap-2 text-white shrink-0 z-20">
                    <button
                        type="button"
                        onClick={togglePlay}
                        className="p-1.5 rounded-full hover:bg-white/20 text-white cursor-pointer transition-colors"
                        title={isPlaying ? 'Pause' : 'Play'}
                    >
                        {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                    </button>

                    <span className="text-[10px]  text-white/80 w-10 text-right">{formatTime(currentTime)}</span>

                    <input
                        type="range"
                        min="0"
                        max={duration || 100}
                        step="0.1"
                        value={currentTime}
                        onChange={handleSeek}
                        className="flex-1 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer accent-primary"
                    />

                    <span className="text-[10px]  text-white/80 w-10">{formatTime(duration)}</span>

                    <button
                        type="button"
                        onClick={toggleMute}
                        className="p-1.5 rounded-full hover:bg-white/20 text-white cursor-pointer transition-colors"
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                </div>
            )}
        </div>
    );
};

export interface MediaPreviewModalProps {
    items: any[];
    initialIndex?: number;
    previewIndex?: number | null;
    onClose: () => void;
    token?: string | null;
    onDelete?: (mediaId: number) => void;
    onRefreshTicket?: () => void;
    minNonAudioCount?: number;
    minNonAudioWarning?: string;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({
    items,
    initialIndex = 0,
    previewIndex: controlledIndex,
    onClose,
    token,
    onDelete,
    onRefreshTicket,
    minNonAudioCount,
    minNonAudioWarning
}) => {
    const [currentIndex, setCurrentIndex] = useState<number>(
        controlledIndex !== undefined && controlledIndex !== null ? controlledIndex : initialIndex
    );
    const [customPreviewUrls, setCustomPreviewUrls] = useState<Record<number, string>>({});
    const [rotation, setRotation] = useState<number>(0);
    const [isSavingRotation, setIsSavingRotation] = useState(false);

    const nonAudioItemsCount = (items || []).filter(m => !isAudio(m?.file_name || '')).length;

    const isCurrentDeletionBlocked = (name: string) => {
        if (!minNonAudioCount) return false;
        if (isAudio(name || '')) return false;
        return nonAudioItemsCount <= minNonAudioCount;
    };

    useEffect(() => {
        if (controlledIndex !== undefined && controlledIndex !== null) {
            setCurrentIndex(controlledIndex);
            const item = items[controlledIndex];
            setRotation(item ? item.rotation || 0 : 0);
        }
    }, [controlledIndex, items]);

    useEffect(() => {
        if (currentIndex >= 0 && currentIndex < items.length) {
            const item = items[currentIndex];
            setRotation(item ? item.rotation || 0 : 0);
        }
    }, [currentIndex, items]);

    const openIndex = (idx: number) => {
        setCurrentIndex(idx);
        const item = items[idx];
        setRotation(item ? item.rotation || 0 : 0);
    };

    const handlePrevPreview = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (items.length <= 1) return;
        const prevIdx = (currentIndex - 1 + items.length) % items.length;
        openIndex(prevIdx);
    };

    const handleNextPreview = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (items.length <= 1) return;
        const nextIdx = (currentIndex + 1) % items.length;
        openIndex(nextIdx);
    };

    const touchStartX = useRef<number | null>(null);
    const touchStartY = useRef<number | null>(null);

    const handleTouchStart = (e: React.TouchEvent) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX.current === null || touchStartY.current === null) return;
        const deltaX = e.changedTouches[0].clientX - touchStartX.current;
        const deltaY = e.changedTouches[0].clientY - touchStartY.current;

        if (Math.abs(deltaX) > 35 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
            if (deltaX < 0) {
                handleNextPreview();
            } else {
                handlePrevPreview();
            }
        }
        touchStartX.current = null;
        touchStartY.current = null;
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft') {
                handlePrevPreview();
            } else if (e.key === 'ArrowRight') {
                handleNextPreview();
            } else if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex, items, onClose]);

    const handleRotateLeft = () => setRotation(prev => (prev - 90 + 360) % 360);
    const handleRotateRight = () => setRotation(prev => (prev + 90) % 360);

    const currentItem = currentIndex >= 0 && currentIndex < items.length ? items[currentIndex] : null;
    if (!currentItem) return null;

    const currentUrl = customPreviewUrls[currentItem.media_id] || getMediaUrl(currentItem.file_url);
    const currentName = currentItem.file_name || '';

    const handleResetRotation = () => setRotation(currentItem?.rotation || 0);

    const handleSaveRotation = async () => {
        if (!currentItem || !currentItem.media_id) return;
        const currentSavedRot = currentItem.rotation || 0;
        const angleDelta = (rotation - currentSavedRot + 360) % 360;
        if (angleDelta === 0) return;

        setIsSavingRotation(true);
        try {
            const authToken = token || localStorage.getItem('token');
            const res = await fetch(`${API_URL}/common/media/${currentItem.media_id}/rotate/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(authToken ? { Authorization: `Token ${authToken}` } : {})
                },
                body: JSON.stringify({ angle: angleDelta })
            });

            if (!res.ok) throw new Error('Failed to save rotation on server.');

            const updatedMedia = await res.json();
            const freshUrl = `${getMediaUrl(updatedMedia.file_url)}?t=${Date.now()}`;
            const newRot = updatedMedia.rotation !== undefined ? updatedMedia.rotation : 0;

            if (isImage(currentName)) {
                await new Promise((resolve) => {
                    const tempImg = new window.Image();
                    tempImg.onload = resolve;
                    tempImg.onerror = resolve;
                    tempImg.src = freshUrl;
                });
            }

            setCustomPreviewUrls(prev => ({ ...prev, [currentItem.media_id]: freshUrl }));
            setRotation(newRot);
            if (onRefreshTicket) onRefreshTicket();
        } catch (err: any) {
            alert(err.message || 'Error saving rotation.');
        } finally {
            setTimeout(() => {
                setIsSavingRotation(false);
            }, 150);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.85 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="fixed inset-0 bg-black/90 backdrop-blur-xs cursor-pointer"
                />

                {/* Modal Box */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative max-w-4xl h-[75vh] sm:h-[80vh] w-full flex flex-col items-center justify-center z-10"
                >
                    {/* Top Action Header Bar */}
                    <div className="w-full flex items-center justify-between gap-2 mb-2 shrink-0 z-30 px-1">
                        {/* Left: Counter Indicator */}
                        <div className="flex items-center gap-2">
                            {items.length > 1 && (
                                <span className="px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-full border border-white/20 text-white text-[11px] font-bold shadow-md select-none">
                                    {currentIndex + 1} / {items.length}
                                </span>
                            )}
                        </div>

                        {/* Right: Action Controls */}
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                            {/* Rotation Controls */}
                            {(isImage(currentName) || isVideo(currentName)) && (
                                <div className="flex items-center gap-0.5 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-white/20">
                                    {rotation !== (currentItem.rotation || 0) && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={handleResetRotation}
                                                className="p-1 rounded-full hover:bg-white/20 text-white cursor-pointer transition-colors"
                                                title="Reset Rotation"
                                            >
                                                <RefreshCw className="w-3.5 h-3.5" />
                                            </button>
                                            {currentItem.media_id && (
                                                <button
                                                    type="button"
                                                    onClick={handleSaveRotation}
                                                    disabled={isSavingRotation}
                                                    className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-md disabled:opacity-50"
                                                    title="Save rotated orientation permanently to server"
                                                >
                                                    {isSavingRotation ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                    <span className="hidden sm:inline">Save</span>
                                                </button>
                                            )}
                                        </>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleRotateLeft}
                                        className="p-1 rounded-full hover:bg-white/20 text-white cursor-pointer transition-colors"
                                        title="Rotate 90° Left"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="text-[10px] font-medium text-white/90 px-0.5">{rotation}°</span>
                                    <button
                                        type="button"
                                        onClick={handleRotateRight}
                                        className="p-1 rounded-full hover:bg-white/20 text-white cursor-pointer transition-colors"
                                        title="Rotate 90° Right"
                                    >
                                        <RotateCw className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}

                            {onDelete && currentItem.media_id && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (isCurrentDeletionBlocked(currentName)) {
                                            const msg = minNonAudioWarning || 'Cannot delete media: At least one photo or video must be kept.';
                                            alert(msg);
                                            return;
                                        }
                                        const mId = currentItem.media_id!;
                                        onClose();
                                        onDelete(mId);
                                    }}
                                    className="p-1.5 rounded-full bg-red-600/80 hover:bg-red-600 text-white cursor-pointer transition-colors"
                                    title={isCurrentDeletionBlocked(currentName) ? (minNonAudioWarning || 'At least one photo or video must be kept') : 'Delete File'}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                            <a
                                href={currentUrl}
                                download={currentName}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
                                title="Download File"
                            >
                                <Download className="w-4 h-4" />
                            </a>
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
                                title="Close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Left Chevron (Previous) */}
                    {items.length > 1 && (
                        <button
                            type="button"
                            onClick={handlePrevPreview}
                            className="absolute left-1 sm:-left-14 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/70 hover:bg-black/90 text-white backdrop-blur-md border border-white/20 transition-all z-30 cursor-pointer shadow-xl hover:scale-110 active:scale-95 flex items-center justify-center"
                            title="Previous media (Left Arrow)"
                        >
                            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                    )}

                    {/* Right Chevron (Next) */}
                    {items.length > 1 && (
                        <button
                            type="button"
                            onClick={handleNextPreview}
                            className="absolute right-1 sm:-right-14 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/70 hover:bg-black/90 text-white backdrop-blur-md border border-white/20 transition-all z-30 cursor-pointer shadow-xl hover:scale-110 active:scale-95 flex items-center justify-center"
                            title="Next media (Right Arrow)"
                        >
                            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                    )}

                    {/* Media Display Container */}
                    <div
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                        className="w-full h-full flex justify-center items-center overflow-hidden rounded-lg bg-black/85 shadow-2xl p-2 touch-pan-y"
                    >
                        {isImage(currentName) ? (
                            <ZoomableImage
                                key={currentUrl}
                                src={currentUrl}
                                alt={currentName}
                                rotation={rotation}
                                containerClassName="w-full h-full"
                                className="max-w-full max-h-full object-contain rounded-md select-none"
                            />
                        ) : isAudio(currentName) ? (
                            <div className="flex flex-col items-center justify-center p-6 bg-surface-container dark:bg-dark-surface-container rounded-xl border border-outline-variant max-w-md w-full text-center shadow-lg">
                                <Headphones className="w-10 h-10 text-primary mb-2 animate-pulse" />
                                <p className="text-xs font-bold text-on-surface dark:text-dark-on-surface uppercase tracking-wider mb-3">{currentName}</p>
                                <audio src={currentUrl} controls autoPlay className="w-full h-10 rounded-lg" />
                            </div>
                        ) : isVideo(currentName) ? (
                            <RotatableVideoPlayer
                                key={currentUrl}
                                src={currentUrl}
                                rotation={rotation}
                                autoPlay
                                controls
                                className="w-full h-full max-h-full"
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center p-8 bg-surface-container rounded-lg border border-outline-variant max-w-md w-full text-center">
                                <FileText className="w-12 h-12 text-primary mb-3 animate-pulse" />
                                <p className="text-xs font-bold text-on-surface uppercase tracking-wider mb-1">{currentName}</p>
                                <p className="text-[11px] text-outline mb-4">Preview not supported for this file format.</p>
                                <a
                                    href={currentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 bg-primary text-white font-semibold text-xs rounded hover:bg-primary-hover active:scale-95 transition-all"
                                >
                                    Open in New Tab
                                </a>
                            </div>
                        )}
                    </div>

                    {/* Caption/Filename */}
                    <div className="absolute -bottom-10 inset-x-0 text-center text-xs font-medium text-white/80 select-none truncate px-4">
                        {currentName}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export const MediaGrid: React.FC<MediaGridProps> = ({
    items,
    emptyLabel,
    onEdit,
    onDelete,
    token,
    onRefreshTicket,
    minNonAudioCount,
    minNonAudioWarning
}) => {
    const [previewIndex, setPreviewIndex] = useState<number | null>(null);

    const nonAudioItemsCount = (items || []).filter(m => !isAudio(m.file_name || '')).length;

    const isNonAudioDeletionBlocked = (m: Media) => {
        if (!minNonAudioCount) return false;
        if (isAudio(m.file_name || '')) return false;
        return nonAudioItemsCount <= minNonAudioCount;
    };

    const openPreviewIndex = (idx: number) => {
        setPreviewIndex(idx);
    };

    const closePreview = () => {
        setPreviewIndex(null);
    };

    if (items.length === 0) {
        return (
            <div className="py-6 text-center text-xs text-outline border-2 border-dashed border-outline-variant dark:border-dark-outline-variant rounded-xl">
                {emptyLabel}
            </div>
        );
    }

    return (
        <>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {items.map((m, idx) => {
                    const url = getMediaUrl(m.file_url);
                    const isAudioItem = isAudio(m.file_name);
                    const itemKey = m.media_id ? `media-${m.media_id}-${idx}` : `media-idx-${idx}`;

                    if (isAudioItem) {
                        return (
                            <AudioGridCard
                                key={itemKey}
                                url={url}
                                fileName={m.file_name}
                                uploader={m.uploaded_by}
                                onDelete={onDelete ? () => onDelete(m.media_id) : undefined}
                                onSelectPreview={() => openPreviewIndex(idx)}
                            />
                        );
                    }

                    return (
                        <div key={itemKey} className="relative aspect-video bg-surface dark:bg-dark-surface rounded-lg overflow-hidden border border-outline-variant dark:border-dark-outline-variant group">
                            {/* Uploader Profile Image Overlay (Top Left) */}
                            {m.uploaded_by && (
                                <div className="absolute top-1 left-1 z-20 pointer-events-none" title={`Uploaded by ${m.uploaded_by.full_name}`}>
                                    <div className="w-5 h-5 rounded-full overflow-hidden flex items-center justify-center font-bold text-[8px] bg-black/70 text-white border border-white/40 shadow-xs">
                                        {m.uploaded_by.profile_image ? (
                                            <img src={getMediaUrl(m.uploaded_by.profile_image)} alt={m.uploaded_by.full_name} className="w-full h-full object-cover" />
                                        ) : (
                                            <span>{m.uploaded_by.full_name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?'}</span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Media Type Icon Badge (Top Right) */}
                            <div className="absolute top-1 right-1 z-10 pointer-events-none p-1 rounded bg-black/50 text-white/90 backdrop-blur-xs">
                                {isImage(m.file_name) ? (
                                    <ImageIcon className="w-3 h-3" />
                                ) : isVideo(m.file_name) ? (
                                    <Video className="w-3 h-3" />
                                ) : (
                                    <FileText className="w-3 h-3" />
                                )}
                            </div>

                            <div
                                onClick={() => openPreviewIndex(idx)}
                                className="block w-full h-full cursor-pointer relative"
                            >
                                {isImage(m.file_name) ? (
                                    <img src={url} alt={m.file_name} style={{ transform: `rotate(${m.rotation || 0}deg)` }} className="w-full h-full object-cover" />
                                ) : isVideo(m.file_name) ? (
                                    <video src={url} style={{ transform: `rotate(${m.rotation || 0}deg)` }} className="w-full h-full object-cover" muted />
                                ) : (
                                    <div className="flex items-center justify-center w-full h-full">
                                        <FileText className="w-6 h-6 text-outline" />
                                    </div>
                                )}
                                {!onEdit && !onDelete && (
                                    <div className="absolute inset-0 bg-black/10 hover:bg-black/30 transition-all flex items-center justify-center">
                                        <Eye className="w-6 h-6 text-white opacity-60 hover:opacity-100 transition-opacity" />
                                    </div>
                                )}
                            </div>

                            {(onEdit || onDelete) && (
                                <div className="absolute top-1 right-7 flex gap-1 z-10">
                                    {onDelete && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                if (isNonAudioDeletionBlocked(m)) {
                                                    const msg = minNonAudioWarning || 'Cannot delete media: At least one photo or video must be kept.';
                                                    alert(msg);
                                                    return;
                                                }
                                                onDelete(m.media_id);
                                            }}
                                            className="p-1 bg-black/60 hover:bg-red-600 text-white rounded transition-colors"
                                            title={isNonAudioDeletionBlocked(m) ? (minNonAudioWarning || 'At least one photo or video must be kept') : 'Delete file'}
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            )}
                            <div className="absolute bottom-0 inset-x-0 bg-black/60 px-1 py-0.5 text-[8px] text-white truncate pointer-events-none">{m.file_name}</div>
                        </div>
                    );
                })}
            </div>

            {/* Media Preview Modal Overlay */}
            {previewIndex !== null && (
                <MediaPreviewModal
                    items={items}
                    previewIndex={previewIndex}
                    onClose={closePreview}
                    token={token}
                    onDelete={onDelete}
                    onRefreshTicket={onRefreshTicket}
                    minNonAudioCount={minNonAudioCount}
                    minNonAudioWarning={minNonAudioWarning}
                />
            )}
        </>
    );
};

export const SectionTitle: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
    <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-primary/10 rounded-lg text-primary">{icon}</div>
        <h4 className="text-xs font-bold text-on-surface dark:text-dark-on-surface uppercase tracking-wider">{label}</h4>
    </div>
);

export const Divider = () => <div className="border-t border-outline-variant dark:border-dark-outline-variant" />;

export const statusColor = (s: string) => {
    switch (s) {
        case 'Open': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
        case 'Approved': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
        case 'In Progress': return 'bg-primary/10 text-primary';
        case 'Completed': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
        case 'Rejected': return 'bg-red-500/10 text-red-600 dark:text-red-400';
        case 'Reconciled': return 'bg-rose-500/10 text-rose-950 dark:text-rose-950';
        default: return 'bg-outline/10 text-outline';
    }
};

/**
 * Physically rotates an image file on canvas by angleDegrees (90, 180, 270)
 * and returns a new rotated File object before upload.
 */
export async function rotateImageFile(file: File, angleDegrees: number): Promise<File> {
    if (!file || (angleDegrees % 360) === 0 || !file.type.startsWith('image/')) return file;

    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(file);

            const normAngle = ((angleDegrees % 360) + 360) % 360;

            if (normAngle === 90 || normAngle === 270) {
                canvas.width = img.height;
                canvas.height = img.width;
            } else {
                canvas.width = img.width;
                canvas.height = img.height;
            }

            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate((normAngle * Math.PI) / 180);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);

            canvas.toBlob(
                (blob) => {
                    if (!blob) return resolve(file);
                    const rotatedFile = new File([blob], file.name, {
                        type: file.type || 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(rotatedFile);
                },
                file.type || 'image/jpeg',
                0.92
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(file);
        };

        img.src = url;
    });
}