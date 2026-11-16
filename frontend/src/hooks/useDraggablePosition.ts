import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

const INTERACTIVE_SELECTOR = 'button, a, input, textarea, select, label, [data-no-drag]';

/**
 * Allows clicking and dragging a modal or panel anywhere on the viewport.
 */
export function useDraggablePosition(resetKey?: unknown) {
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    setOffset({ x: 0, y: 0 });
    setIsDragging(false);
  }, [resetKey]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setOffset({
        x: e.clientX - startRef.current.x,
        y: e.clientY - startRef.current.y,
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      setOffset({
        x: e.touches[0].clientX - startRef.current.x,
        y: e.touches[0].clientY - startRef.current.y,
      });
    };

    const stopDragging = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDragging);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', stopDragging);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDragging);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', stopDragging);
    };
  }, [isDragging]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest(INTERACTIVE_SELECTOR)) return;
      startRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
      setIsDragging(true);
    },
    [offset.x, offset.y]
  );

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest(INTERACTIVE_SELECTOR)) return;
      startRef.current = {
        x: e.touches[0].clientX - offset.x,
        y: e.touches[0].clientY - offset.y,
      };
      setIsDragging(true);
    },
    [offset.x, offset.y]
  );

  return {
    dragStyle: {
      transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
    } as React.CSSProperties,
    dragHandlers: {
      onMouseDown,
      onTouchStart,
    },
    isDragging,
  };
}
