import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const SapWindowTaskbarContext = createContext(null);

export function SapWindowTaskbarProvider({ children }) {
  const [tasks, setTasks] = useState([]);

  const upsertTask = useCallback((task) => {
    if (!task?.id) return;

    setTasks((current) => {
      const normalizedTask = {
        id: task.id,
        title: task.title || "Window",
        path: task.path || window.location.pathname,
      };
      const existingIndex = current.findIndex((entry) => entry.id === normalizedTask.id);

      if (existingIndex === -1) {
        return [...current, normalizedTask];
      }

      const next = [...current];
      const existingTask = next[existingIndex];
      if (
        existingTask.title === normalizedTask.title
        && existingTask.path === normalizedTask.path
      ) {
        return current;
      }

      next[existingIndex] = { ...next[existingIndex], ...normalizedTask };
      return next;
    });
  }, []);

  const removeTask = useCallback((taskId) => {
    setTasks((current) => current.filter((task) => task.id !== taskId));
  }, []);

  const value = useMemo(
    () => ({
      tasks,
      upsertTask,
      removeTask,
    }),
    [removeTask, tasks, upsertTask],
  );

  return (
    <SapWindowTaskbarContext.Provider value={value}>
      {children}
    </SapWindowTaskbarContext.Provider>
  );
}

export function useSapWindowTaskbar() {
  return useContext(SapWindowTaskbarContext);
}

export function useSapWindowTaskbarActions() {
  const taskbar = useSapWindowTaskbar();
  const navigate = useNavigate();

  const restoreTask = useCallback((task, { minimizeActive = true } = {}) => {
    if (!task) return false;
    if (minimizeActive) {
      window.dispatchEvent(new CustomEvent("sap-window-minimize-active", { detail: { excludeId: task.id } }));
    }
    taskbar.removeTask(task.id);
    window.dispatchEvent(new CustomEvent("sap-window-restore", { detail: { id: task.id } }));

    if (task.path && task.path !== window.location.pathname) {
      navigate(task.path);
    }
    return true;
  }, [navigate, taskbar]);

  const closeActiveAndRestorePrevious = useCallback(() => {
    const previousTask = taskbar?.tasks?.[taskbar.tasks.length - 1];
    if (!previousTask) return false;
    return restoreTask(previousTask, { minimizeActive: false });
  }, [restoreTask, taskbar]);

  return {
    closeActiveAndRestorePrevious,
    restoreTask,
    taskCount: taskbar?.tasks?.length || 0,
  };
}

export function SapWindowTaskbar() {
  const taskbar = useSapWindowTaskbar();
  const { restoreTask } = useSapWindowTaskbarActions();

  if (!taskbar?.tasks?.length) {
    return null;
  }

  return (
    <div className="sap-window-taskbar" aria-label="Minimized windows">
      {taskbar.tasks.map((task) => (
        <button
          key={task.id}
          type="button"
          className="sap-window-taskbar__item"
          onClick={() => restoreTask(task)}
          title={task.title}
        >
          <span className="sap-window-taskbar__icon" aria-hidden="true" />
          <span className="sap-window-taskbar__title">{task.title}</span>
        </button>
      ))}
    </div>
  );
}
