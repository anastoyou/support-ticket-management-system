import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Video, X, RefreshCw, Circle, Square, Check, Loader2, RotateCcw, RotateCw } from 'lucide-react';
import { rotateImageFile } from '../pages/ticket/TicketsTypesAndComponents';

interface LiveCameraModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (file: File) => void;
    initialMode?: 'photo' | 'video';
    photoOnly?: boolean;
    onNativeFallback?: () => void;
}

export const LiveCameraModal: React.FC<LiveCameraModalProps> = ({
    isOpen,
    onClose,
    onCapture,
    initialMode = 'photo',
    photoOnly = false,
    onNativeFallback,
}) => {
    const [mode, setMode] = useState<'photo' | 'video'>(initialMode);
    const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
    const [isStreamLoading, setIsStreamLoading] = useState(true);
    const [streamError, setStreamError] = useState<string | null>(null);

    // Video Recording state
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);

    // Captured Media Preview State
    const [capturedPreview, setCapturedPreview] = useState<{ url: string; file: File; type: 'photo' | 'video' } | null>(null);
    const [photoRotation, setPhotoRotation] = useState<number>(0);

    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const timerIntervalRef = useRef<any>(null);

    // Sync mode prop when modal opens
    useEffect(() => {
        if (isOpen) {
            setMode(initialMode);
            setCapturedPreview(null);
        }
    }, [isOpen, initialMode]);

    // Revoke temporary blob preview URLs to prevent mobile memory buildup
    useEffect(() => {
        const previewUrl = capturedPreview?.url;
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [capturedPreview?.url]);

    // Start/Stop Camera Stream
    useEffect(() => {
        if (!isOpen || capturedPreview) {
            stopStream();
            return;
        }

        startCamera();

        return () => {
            stopStream();
        };
    }, [isOpen, facingMode, capturedPreview]);

    const stopStream = () => {
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try {
                mediaRecorderRef.current.stop();
            } catch (e) {
                // ignore
            }
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsRecording(false);
        setRecordingTime(0);
    };

    const startCamera = async () => {
        setIsStreamLoading(true);
        setStreamError(null);
        stopStream();

        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Live camera preview is unavailable on this browser connection.');
            }

            const needAudio = !photoOnly;
            const constraints: MediaStreamConstraints = {
                video: {
                    facingMode: { ideal: facingMode },
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: needAudio
            };

            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                // Fallback without strict resolution/facing constraints
                try {
                    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode } }, audio: needAudio });
                } catch {
                    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: needAudio });
                }
            }

            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setIsStreamLoading(false);
        } catch (err: any) {
            console.error('Camera access error:', err);
            setStreamError(err.message || 'Unable to access camera. Please check browser permissions.');
            setIsStreamLoading(false);
        }
    };

    const toggleFacingMode = () => {
        setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
    };

    // Take Photo Snapshot
    const takePhoto = () => {
        if (!videoRef.current) return;

        const video = videoRef.current;
        const srcW = video.videoWidth || 1280;
        const srcH = video.videoHeight || 720;
        const MAX_DIM = 1600;
        const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(srcW * scale));
        canvas.height = Math.max(1, Math.round(srcH * scale));

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Mirror if front camera
        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            if (!blob) return;
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const file = new File([blob], `photo_${timestamp}.jpg`, { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            setPhotoRotation(0);
            setCapturedPreview({ url, file, type: 'photo' });
            stopStream();
        }, 'image/jpeg', 0.9);
    };

    // Start Recording Live Video
    const startVideoRecording = () => {
        if (!streamRef.current) return;

        recordedChunksRef.current = [];
        let mimeType = 'video/webm;codecs=vp9,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'video/mp4';
                if (!MediaRecorder.isTypeSupported(mimeType)) {
                    mimeType = '';
                }
            }
        }

        try {
            const options = mimeType ? { mimeType } : undefined;
            const recorder = new MediaRecorder(streamRef.current, options);

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    recordedChunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'video/webm' });
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const ext = (recorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm';
                const file = new File([blob], `video_${timestamp}.${ext}`, { type: blob.type });
                const url = URL.createObjectURL(blob);
                setCapturedPreview({ url, file, type: 'video' });
            };

            mediaRecorderRef.current = recorder;
            recorder.start(1000);
            setIsRecording(true);
            setRecordingTime(0);

            timerIntervalRef.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } catch (err) {
            console.error('Failed to start MediaRecorder:', err);
            setStreamError('Failed to record video on this browser.');
        }
    };

    // Stop Recording Live Video
    const stopVideoRecording = () => {
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
        setIsRecording(false);
        stopStream();
    };

    const confirmCapturedMedia = async () => {
        if (capturedPreview) {
            let fileToUpload = capturedPreview.file;
            if (capturedPreview.type === 'photo' && photoRotation % 360 !== 0) {
                fileToUpload = await rotateImageFile(capturedPreview.file, photoRotation);
            }
            onCapture(fileToUpload);
            onClose();
        }
    };

    const retakeMedia = () => {
        setPhotoRotation(0);
        setCapturedPreview(null);
    };

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-60 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-xs">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative w-full max-w-lg bg-gray-900 border border-gray-800 rounded overflow-hidden shadow-2xl flex flex-col max-h-[94dvh]"
                >
                    {/* Header Bar */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-900/90 border-b border-gray-800 z-10">
                        <div className="flex items-center gap-2">
                            {mode === 'photo' ? (
                                <Camera className="w-4 h-4 text-emerald-400" />
                            ) : (
                                <Video className="w-4 h-4 text-red-400" />
                            )}
                            <span className="text-sm font-semibold text-white">
                                {capturedPreview ? 'Review Captured Media' : mode === 'photo' ? 'Take Live Photo' : 'Record Live Video'}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Viewfinder Container */}
                    <div className="relative bg-black flex-1 min-h-[48dvh] sm:min-h-[320px] max-h-[62dvh] sm:max-h-[480px] flex items-center justify-center overflow-hidden">
                        {isStreamLoading && !capturedPreview && (
                            <div className="flex flex-col items-center gap-2 text-gray-400">
                                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                <span className="text-xs">Initializing Camera...</span>
                            </div>
                        )}

                        {streamError && !capturedPreview && (
                            <div className="p-4 text-center max-w-xs text-red-400 text-xs space-y-3">
                                <div>
                                    <p className="font-semibold mb-1">Camera Error</p>
                                    <p>{streamError}</p>
                                </div>
                                {onNativeFallback && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onClose();
                                            onNativeFallback();
                                        }}
                                        className="px-3.5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                                    >
                                        <Camera className="w-4 h-4" />
                                        <span>Open Device Camera</span>
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Live Video Viewfinder */}
                        {!capturedPreview && (
                            <video
                                ref={videoRef}
                                playsInline
                                muted
                                className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                            />
                        )}

                        {/* Captured Media Preview */}
                        {capturedPreview && (
                            <div className="w-full h-full flex items-center justify-center bg-black">
                                {capturedPreview.type === 'photo' ? (
                                    <img
                                        src={capturedPreview.url}
                                        alt="Captured snapshot"
                                        style={{
                                            transform: `rotate(${photoRotation}deg)`,
                                            transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                        className="w-full h-full object-contain"
                                    />
                                ) : (
                                    <video src={capturedPreview.url} controls autoPlay className="w-full h-full object-contain" />
                                )}
                            </div>
                        )}

                        {/* Recording Timer Badge */}
                        {isRecording && (
                            <div className="absolute top-3 left-3 bg-red-600/90 text-white px-3 py-1 rounded-full text-xs  font-bold flex items-center gap-2 shadow-lg animate-pulse">
                                <span className="w-2 h-2 rounded-full bg-white" />
                                <span>REC {formatTime(recordingTime)}</span>
                            </div>
                        )}

                        {/* Camera Flip Button (Overlaid on Viewfinder) */}
                        {!capturedPreview && !isRecording && (
                            <button
                                type="button"
                                onClick={toggleFacingMode}
                                className="absolute top-3 right-3 p-2.5 rounded-full bg-gray-900/70 text-white hover:bg-gray-800 backdrop-blur-md cursor-pointer transition-colors shadow-md"
                                title="Switch Camera (Front/Rear)"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    {/* Controls Footer */}
                    <div className="p-4 bg-gray-900 border-t border-gray-800 flex flex-col gap-3">
                        {/* Mode Switcher Tabs (Only when not captured, not recording, and video is allowed) */}
                        {!photoOnly && !capturedPreview && !isRecording && (
                            <div className="flex justify-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setMode('photo')}
                                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${mode === 'photo' ? 'bg-primary text-on-primary' : 'bg-gray-800 text-gray-400 hover:text-white'
                                        }`}
                                >
                                    <Camera className="w-3.5 h-3.5" /> Photo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('video')}
                                    className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${mode === 'video' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                                        }`}
                                >
                                    <Video className="w-3.5 h-3.5" /> Video
                                </button>
                            </div>
                        )}

                        {/* Capture Trigger Controls */}
                        {!capturedPreview ? (
                            <div className="flex items-center justify-center py-2">
                                {mode === 'photo' ? (
                                    <button
                                        type="button"
                                        onClick={takePhoto}
                                        disabled={isStreamLoading || !!streamError}
                                        className="w-16 h-16 rounded-full border-4 border-white bg-white/20 hover:bg-white/40 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-lg disabled:opacity-40"
                                    >
                                        <div className="w-12 h-12 rounded-full bg-white" />
                                    </button>
                                ) : (
                                    !isRecording ? (
                                        <button
                                            type="button"
                                            onClick={startVideoRecording}
                                            disabled={isStreamLoading || !!streamError}
                                            className="w-16 h-16 rounded-full border-4 border-red-500 bg-red-500/20 hover:bg-red-500/40 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-lg disabled:opacity-40"
                                        >
                                            <Circle className="w-8 h-8 fill-red-600 text-red-600" />
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={stopVideoRecording}
                                            className="w-16 h-16 rounded-full border-4 border-white bg-red-600 active:scale-95 transition-all flex items-center justify-center cursor-pointer shadow-lg animate-pulse"
                                        >
                                            <Square className="w-6 h-6 fill-white text-white" />
                                        </button>
                                    )
                                )}
                            </div>
                        ) : (
                            /* Review & Accept / Retake Buttons */
                            <div className="flex flex-col gap-2">
                                {capturedPreview.type === 'photo' && (
                                    <div className="flex items-center justify-center gap-2 pb-1 border-b border-gray-800/80">
                                        <button
                                            type="button"
                                            onClick={() => setPhotoRotation(prev => (prev - 90 + 360) % 360)}
                                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded transition-colors cursor-pointer flex items-center gap-1.5"
                                            title="Rotate 90° Left"
                                        >
                                            <RotateCcw className="w-3.5 h-3.5" /> Rotate Left
                                        </button>
                                        <span className="text-xs  font-medium text-gray-300 px-2">{photoRotation}°</span>
                                        <button
                                            type="button"
                                            onClick={() => setPhotoRotation(prev => (prev + 90) % 360)}
                                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded transition-colors cursor-pointer flex items-center gap-1.5"
                                            title="Rotate 90° Right"
                                        >
                                            <RotateCw className="w-3.5 h-3.5" /> Rotate Right
                                        </button>
                                    </div>
                                )}
                                <div className="flex items-center justify-between gap-3">
                                    <button
                                        type="button"
                                        onClick={retakeMedia}
                                        className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold rounded transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                        <RefreshCw className="w-4 h-4" /> Retake
                                    </button>
                                    <button
                                        type="button"
                                        onClick={confirmCapturedMedia}
                                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
                                    >
                                        <Check className="w-4 h-4" /> Use Media
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
