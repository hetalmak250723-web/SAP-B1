import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSapWindowTaskbar } from '../SapWindowTaskbarContext';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getWindowBounds = (node, minMargin) => {
  const container = node?.offsetParent || node?.parentElement;

  if (!container) {
    return {
      width: typeof window === 'undefined' ? 0 : window.innerWidth,
      height: typeof window === 'undefined' ? 0 : window.innerHeight,
      left: minMargin,
      top: minMargin,
    };
  }

  return {
    width: container.clientWidth,
    height: container.clientHeight,
    left: minMargin,
    top: minMargin,
  };
};

const getTaskPath = (taskPath, pathname, search) => taskPath || `${pathname}${search || ''}`;

function useFloatingWindow({
  isOpen = true,
  defaultTop = 16,
  minMargin = 8,
  resetOnClose = true,
  taskId,
  taskTitle = 'Window',
  taskPath,
} = {}) {
  const location = useLocation();
  const { pathname, search } = location;
  const taskbar = useSapWindowTaskbar();
  const upsertTask = taskbar?.upsertTask;
  const removeTask = taskbar?.removeTask;
  const windowRef = useRef(null);
  const dragStateRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const centerWindow = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const node = windowRef.current;
    if (!node) {
      return;
    }

    const rect = node.getBoundingClientRect();
    const bounds = getWindowBounds(node, minMargin);
    const maxLeft = Math.max(bounds.left, bounds.width - rect.width - minMargin);
    const maxTop = Math.max(bounds.top, bounds.height - rect.height - minMargin);
    const nextLeft = clamp((bounds.width - rect.width) / 2, bounds.left, maxLeft);
    const nextTop = clamp(defaultTop, bounds.top, maxTop);

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
        setIsMaximized(false);
        if (taskId) {
          removeTask?.(taskId);
        }
      }
      return undefined;
    }

    const frameId = window.requestAnimationFrame(centerWindow);
    return () => window.cancelAnimationFrame(frameId);
  }, [centerWindow, isOpen, removeTask, resetOnClose, taskId]);

  useEffect(() => {
    if (!taskId || !isOpen) {
      return undefined;
    }

    const handleRestore = (event) => {
      if (event.detail?.id !== taskId) {
        return;
      }
      setIsMinimized(false);
      setIsMaximized(false);
      centerWindow();
    };

    window.addEventListener('sap-window-restore', handleRestore);
    return () => window.removeEventListener('sap-window-restore', handleRestore);
  }, [centerWindow, isOpen, taskId]);

  useEffect(() => {
    if (!taskId || !isOpen) {
      return undefined;
    }

    const handleMinimizeActive = (event) => {
      if (event.detail?.excludeId === taskId || isMinimized) {
        return;
      }

      setIsMaximized(false);
      setIsMinimized(true);
      upsertTask?.({
        id: taskId,
        title: taskTitle,
        path: getTaskPath(taskPath, pathname, search),
      });
    };

    window.addEventListener('sap-window-minimize-active', handleMinimizeActive);
    return () => window.removeEventListener('sap-window-minimize-active', handleMinimizeActive);
  }, [isMinimized, isOpen, pathname, search, taskId, taskPath, taskTitle, upsertTask]);

  useEffect(() => {
    if (!taskId || !isOpen) {
      return;
    }

    if (isMinimized) {
      upsertTask?.({
        id: taskId,
        title: taskTitle,
        path: getTaskPath(taskPath, pathname, search),
      });
      return;
    }

    removeTask?.(taskId);
  }, [isMinimized, isOpen, pathname, removeTask, search, taskId, taskPath, taskTitle, upsertTask]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') {
      return undefined;
    }

    const handleMouseMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const node = windowRef.current;
      if (!node) {
        return;
      }

      const bounds = getWindowBounds(node, minMargin);
      const maxLeft = Math.max(bounds.left, bounds.width - dragState.width - minMargin);
      const maxTop = Math.max(bounds.top, bounds.height - dragState.height - minMargin);

      setPosition({
        left: clamp(dragState.startLeft + (event.clientX - dragState.startX), bounds.left, maxLeft),
        top: clamp(dragState.startTop + (event.clientY - dragState.startY), bounds.top, maxTop),
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

        const bounds = getWindowBounds(node, minMargin);
        const maxLeft = Math.max(bounds.left, bounds.width - rect.width - minMargin);
        const maxTop = Math.max(bounds.top, bounds.height - rect.height - minMargin);

        return {
          left: clamp(current.left, bounds.left, maxLeft),
          top: clamp(current.top, bounds.top, maxTop),
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

    if (isMaximized) {
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
      startLeft: position?.left ?? node.offsetLeft,
      startTop: position?.top ?? node.offsetTop,
      width: rect.width,
      height: rect.height,
    };
    document.body.style.userSelect = 'none';
    event.preventDefault();
  };

  return {
    isMinimized,
    isMaximized,
    restoreWindow: () => {
      setIsMinimized(false);
      setIsMaximized(false);
      if (taskId) {
        removeTask?.(taskId);
      }
      centerWindow();
    },
    titleBarProps: {
      onMouseDown: handleTitleBarMouseDown,
      onDoubleClick: () => {
        setIsMinimized(false);
        setIsMaximized((current) => !current);
      },
    },
    toggleMaximize: () => {
      setIsMinimized(false);
      setIsMaximized((current) => !current);
    },
    toggleMinimize: () => {
      setIsMaximized(false);
      setIsMinimized((current) => !current);
    },
    windowProps: {
      ref: windowRef,
      style: isMinimized && taskId
        ? {
          display: 'none',
        }
        : isMaximized
        ? {
          position: 'absolute',
          left: `${minMargin}px`,
          top: `${minMargin}px`,
          width: `calc(100% - ${minMargin * 2}px)`,
          height: `calc(100% - ${minMargin * 2}px)`,
          maxWidth: 'none',
          maxHeight: 'none',
        }
        : position
        ? {
          position: 'absolute',
          left: `${position.left}px`,
          top: `${position.top}px`,
          maxWidth: `calc(100% - ${minMargin * 2}px)`,
          maxHeight: `calc(100% - ${minMargin * 2}px)`,
        }
        : undefined,
    },
  };
}

export default useFloatingWindow;
