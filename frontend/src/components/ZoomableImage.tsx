import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, RotateCw, X } from 'lucide-react';

export interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
  containerClassName?: string;
  rotation?: number;
  showControls?: boolean;
  minZoom?: number;
  maxZoom?: number;
  onImageClick?: () => void;
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void;
}

export const ZoomableImage: React.FC<ZoomableImageProps> = ({
  src,
  alt = 'Image Preview',
  className = '',
  containerClassName = '',
  rotation = 0,
  showControls = true,
  minZoom = 0.5,
  maxZoom = 5,
  onImageClick,
  onError
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hasDraggedRef = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initialDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(1);

  // Reset zoom & pan when source image changes
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [src]);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoom(prev => Math.min(maxZoom, Number((prev + 0.25).toFixed(2))));
  }, [maxZoom]);

  const handleZoomOut = useCallback(() => {
    setZoom(prev => Math.max(minZoom, Number((prev - 0.25).toFixed(2))));
  }, [minZoom]);

  // Non-passive native wheel listener so scrolling zooms the image without scrolling background tables/pages
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Delta direction: deltaY < 0 = scroll up (zoom in), deltaY > 0 = scroll down (zoom out)
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      setZoom(prev => Math.min(maxZoom, Math.max(minZoom, Number((prev * factor).toFixed(2)))));
    };

    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleNativeWheel);
    };
  }, [maxZoom, minZoom]);

  // Global mouse move/up listeners while dragging so panning stays smooth everywhere
  useEffect(() => {
    if (!isDragging) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - pointerDownPosRef.current.x;
      const dy = e.clientY - pointerDownPosRef.current.y;
      if (Math.hypot(dx, dy) > 4) {
        hasDraggedRef.current = true;
      }
      setPan({
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y
      });
    };

    const handleWindowMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isDragging]);

  // Mouse pan handlers (allowed at any zoom level)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    hasDraggedRef.current = false;
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  // Double click toggles zoom between 1x and 2.5x
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (zoom !== 1 || pan.x !== 0 || pan.y !== 0) {
      handleReset();
    } else {
      setZoom(2.5);
    }
  };

  // Touch handlers for mobile pinch-to-zoom and drag at any zoom level
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initialDistanceRef.current = dist;
      initialZoomRef.current = zoom;
      setIsDragging(false);
    } else if (e.touches.length === 1) {
      hasDraggedRef.current = false;
      pointerDownPosRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialDistanceRef.current !== null) {
      e.stopPropagation();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = dist / initialDistanceRef.current;
      const next = Math.min(maxZoom, Math.max(minZoom, Number((initialZoomRef.current * scale).toFixed(2))));
      setZoom(next);
    } else if (e.touches.length === 1 && isDragging) {
      e.stopPropagation();
      const dx = e.touches[0].clientX - pointerDownPosRef.current.x;
      const dy = e.touches[0].clientY - pointerDownPosRef.current.y;
      if (Math.hypot(dx, dy) > 4) {
        hasDraggedRef.current = true;
      }
      setPan({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y
      });
    }
  };

  const handleTouchEnd = () => {
    initialDistanceRef.current = null;
    setIsDragging(false);
  };

  const handleContainerClick = (e: React.MouseEvent) => {
    if (hasDraggedRef.current) {
      e.stopPropagation();
      hasDraggedRef.current = false;
      return;
    }
    if (onImageClick) {
      onImageClick();
    }
  };

  const cursorClass = isDragging ? 'cursor-grabbing' : 'cursor-grab';

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleContainerClick}
      className={`relative w-full h-full overflow-hidden overscroll-contain select-none touch-none flex items-center justify-center ${cursorClass} ${containerClassName}`}
    >
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
          transition: isDragging ? 'none' : 'transform 0.15s ease-out'
        }}
        className="w-full h-full flex items-center justify-center pointer-events-none"
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          onError={onError}
          className={`max-w-full max-h-full w-auto h-auto object-contain pointer-events-none ${className}`}
        />
      </div>

      {/* Floating Zoom / Pan Controls Overlay */}
      {showControls && (
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          className="absolute bottom-2.5 left-1/2 -translate-x-1/2 bg-black/75 backdrop-blur-md px-2 py-1 rounded-full border border-white/20 text-white flex items-center gap-1.5 shadow-lg text-[11px] font-medium z-20 pointer-events-auto transition-opacity cursor-default"
        >
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= minZoom}
            className="p-1 rounded-full hover:bg-white/20 active:scale-95 disabled:opacity-35 transition-colors cursor-pointer"
            title="Zoom Out (Scroll Down)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="px-1.5 py-0.5 rounded font-mono font-bold hover:bg-white/20 transition-colors cursor-pointer"
            title="Reset Zoom (Double click image)"
          >
            {Math.round(zoom * 100)}%
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= maxZoom}
            className="p-1 rounded-full hover:bg-white/20 active:scale-95 disabled:opacity-35 transition-colors cursor-pointer"
            title="Zoom In (Scroll Up)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
            <button
              type="button"
              onClick={handleReset}
              className="p-1 rounded-full hover:bg-white/20 active:scale-95 text-amber-400 transition-colors cursor-pointer ml-0.5 border-l border-white/20 pl-1.5"
              title="Reset Position & Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export interface ZoomableLightboxProps {
  media: { url: string; title?: string } | null;
  onClose: () => void;
  zIndexClass?: string;
}

const resolveMediaSrc = (url: string): string => {
  if (url.startsWith('http') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  return `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}${url}`;
};

/**
 * Full-viewport media lightbox built around ZoomableImage (and iframe fallback for PDFs).
 */
export const ZoomableLightbox: React.FC<ZoomableLightboxProps> = ({
  media,
  onClose,
  zIndexClass = 'z-[100]',
}) => {
  const [rotation, setRotation] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    setRotation(0);
  }, [media?.url]);

  const isOpen = Boolean(media);
  useEffect(() => {
    if (!isOpen) return;
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };

    const overlay = overlayRef.current;
    const onWheel = (e: WheelEvent) => {
      if (!e.defaultPrevented) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    overlay?.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      window.removeEventListener('keydown', onKeyDown);
      overlay?.removeEventListener('wheel', onWheel);
    };
  }, [isOpen]);

  if (!media) return null;

  const resolvedUrl = resolveMediaSrc(media.url);
  const isPdf =
    resolvedUrl.toLowerCase().endsWith('.pdf') || resolvedUrl.toLowerCase().includes('/pdf');

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 ${zIndexClass} bg-black/90 backdrop-blur-xs flex flex-col overscroll-contain animate-in fade-in duration-150`}
      onClick={onClose}
    >
      {/* Floating Header Controls */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-black/50 border-b border-white/10 text-white shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs sm:text-sm font-semibold truncate pr-4">
          {media.title || 'Media Preview'}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          {!isPdf && (
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
              title="Rotate 90°"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
            aria-label="Close Preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Full-Viewport Media Canvas */}
      <div
        className="flex-1 min-h-0 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {isPdf ? (
          <iframe
            src={resolvedUrl}
            title={media.title || 'Document Preview'}
            className="w-full h-full border-0 bg-white"
          />
        ) : (
          <ZoomableImage
            src={resolvedUrl}
            alt={media.title || 'Image Preview'}
            rotation={rotation}
            containerClassName="w-full h-full"
            className="max-w-full max-h-full w-auto h-auto object-contain p-4"
          />
        )}
      </div>
    </div>
  );
};
