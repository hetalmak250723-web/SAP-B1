import { useCallback, useEffect, useRef, useState } from 'react';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function useFloatingWindow({
  isOpen = true,
  defaultTop = 16,
  minMargin = 8,
  resetOnClose = true,
} = {}) {
  const windowRef = useRef(null);
  const dragStateRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);

  const centerWindow = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const node = windowRef.current;
    if (!node) {
      return;
    }

    const rect = node.getBoundingClientRect();
    const maxLeft = Math.max(minMargin, window.innerWidth - rect.width - minMargin);
    const maxTop = Math.max(minMargin, window.innerHeight - rect.height - minMargin);
    const nextLeft = clamp((window.innerWidth - rect.width) / 2, minMargin, maxLeft);
    const nextTop = clamp(defaultTop, minMargin, maxTop);

    setPosition({
      left: nextLeft,
      top: nextTop,
    });
  }, [defaultTop, minMargin]);

  useEffect(() => {
    if (!isOpen) {
      if (resetOnClose) {
        setPosition(null);
        setIsMinimized(false);
      }
      return undefined;
    }

    const frameId = window.requestAnimationFrame(centerWindow);
    return () => window.cancelAnimationFrame(frameId);
  }, [centerWindow, isOpen, resetOnClose]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return undefined;
    }

    const handleMouseMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const maxLeft = Math.max(minMargin, window.innerWidth - dragState.width - minMargin);
      const maxTop = Math.max(minMargin, window.innerHeight - dragState.height - minMargin);

      setPosition({
        left: clamp(dragState.startLeft + (event.clientX - dragState.startX), minMargin, maxLeft),
        top: clamp(dragState.startTop + (event.clientY - dragState.startY), minMargin, maxTop),
      });
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      document.body.style.userSelect = '';
    };

    const handleResize = () => {
      const node = windowRef.current;
      if (!node) {
        return;
      }

      const rect = node.getBoundingClientRect();
      setPosition((current) => {
        if (!current) {
          return current;
        }

        const maxLeft = Math.max(minMargin, window.innerWidth - rect.width - minMargin);
        const maxTop = Math.max(minMargin, window.innerHeight - rect.height - minMargin);

        return {
          left: clamp(current.left, minMargin, maxLeft),
          top: clamp(current.top, minMargin, maxTop),
        };
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      document.body.style.userSelect = '';
    };
  }, [isOpen, minMargin]);

  const handleTitleBarMouseDown = (event) => {
    if (event.button !== 0) {
      return;
    }

    const interactiveTarget = event.target.closest('button, input, select, textarea, a, label');
    if (interactiveTarget) {
      return;
    }

    const node = windowRef.current;
    if (!node) {
      return;
    }

    const rect = node.getBoundingClientRect();
    dragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startLeft: position?.left ?? rect.left,
      startTop: position?.top ?? rect.top,
      width: rect.width,
      height: rect.height,
    };
    document.body.style.userSelect = 'none';
    event.preventDefault();
  };

  return {
    isMinimized,
    restoreWindow: () => {
      setIsMinimized(false);
      centerWindow();
    },
    titleBarProps: {
      onMouseDown: handleTitleBarMouseDown,
    },
    toggleMinimize: () => setIsMinimized((current) => !current),
    windowProps: {
      ref: windowRef,
      style: position
        ? {
          position: 'absolute',
          left: `${position.left}px`,
          top: `${position.top}px`,
        }
        : undefined,
    },
  };
}

export default useFloatingWindow;
