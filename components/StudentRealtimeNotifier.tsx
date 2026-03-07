import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, Wrench, X } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

type NotificationPermissionState = 'default' | 'denied' | 'granted' | 'unsupported';

type MaintenanceStatus = {
  enabled: boolean;
  message: string;
  updatedAt?: string | null;
};

type ToastItem = {
  id: string;
  title: string;
  message: string;
  kind: 'task' | 'submission' | 'maintenance';
};

export type StudentTaskNotification = {
  id: string;
  taskId: string;
  title: string;
  deadline: string | null;
  createdAt: string;
};

export type EvaluatorSubmissionNotification = {
  id: string;
  submissionId: string;
  taskId: string;
  taskTitle: string;
  studentName: string;
  submittedAt: string;
};

type StudentRealtimeNotifierProps = {
  onTaskNotification?: (notification: StudentTaskNotification) => void;
  onEvaluatorSubmissionNotification?: (notification: EvaluatorSubmissionNotification) => void;
};

const POLL_INTERVAL_MS = 15000;
const TOAST_TTL_MS = 7000;
const LAST_STUDENT_TASK_KEY = 'dtep_last_student_task_notification_at';
const LAST_EVALUATOR_SUBMISSION_KEY = 'dtep_last_evaluator_submission_at';
const LAST_STUDENT_MAINTENANCE_KEY = 'dtep_last_student_maintenance_notification_at';
const LAST_EVALUATOR_MAINTENANCE_KEY = 'dtep_last_evaluator_maintenance_notification_at';
const NOTIFICATION_PROMPT_DISMISSED_KEY = 'dtep_notification_prompt_dismissed';

const getPrimaryNotificationKey = (role: 'student' | 'evaluator') =>
  role === 'student' ? LAST_STUDENT_TASK_KEY : LAST_EVALUATOR_SUBMISSION_KEY;

const getMaintenanceNotificationKey = (role: 'student' | 'evaluator') =>
  role === 'student' ? LAST_STUDENT_MAINTENANCE_KEY : LAST_EVALUATOR_MAINTENANCE_KEY;

const safeToISOString = (value: any) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const formatDueDate = (deadline: string) => {
  const date = new Date(deadline);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const supportsBrowserNotifications = () =>
  typeof window !== 'undefined' && 'Notification' in window;

const StudentRealtimeNotifier: React.FC<StudentRealtimeNotifierProps> = ({
  onTaskNotification,
  onEvaluatorSubmissionNotification
}) => {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermissionState>(() => {
    if (!supportsBrowserNotifications()) return 'unsupported';
    return Notification.permission as NotificationPermissionState;
  });
  const [isPromptDismissed, setIsPromptDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(NOTIFICATION_PROMPT_DISMISSED_KEY) === '1';
  });
  const [maintenanceStatus, setMaintenanceStatus] = useState<MaintenanceStatus | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const lastPrimaryAtRef = useRef('');
  const lastMaintenanceAtRef = useRef('');
  const taskNotificationRef = useRef(onTaskNotification);
  const evaluatorNotificationRef = useRef(onEvaluatorSubmissionNotification);
  const permissionRef = useRef<NotificationPermissionState>(permission);

  const activeRole = user?.role === 'student' || user?.role === 'evaluator'
    ? user.role
    : null;

  useEffect(() => {
    permissionRef.current = permission;
  }, [permission]);

  useEffect(() => {
    taskNotificationRef.current = onTaskNotification;
    evaluatorNotificationRef.current = onEvaluatorSubmissionNotification;
  }, [onTaskNotification, onEvaluatorSubmissionNotification]);

  const shouldShowPermissionPrompt = useMemo(() => {
    if (!activeRole) return false;
    if (permission !== 'default') return false;
    return !isPromptDismissed;
  }, [permission, activeRole, isPromptDismissed]);

  const pushToast = (title: string, message: string, kind: ToastItem['kind']) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [{ id, title, message, kind }, ...prev].slice(0, 4));

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, TOAST_TTL_MS);
  };

  const triggerBrowserNotification = (title: string, body: string) => {
    if (!supportsBrowserNotifications()) return;
    if (permissionRef.current !== 'granted') return;

    try {
      new Notification(title, { body });
    } catch (_) {
      // In-app toast is already shown.
    }
  };

  const updateLastPrimaryAt = (role: 'student' | 'evaluator', isoDate: string) => {
    lastPrimaryAtRef.current = isoDate;
    localStorage.setItem(getPrimaryNotificationKey(role), isoDate);
  };

  const updateLastMaintenanceAt = (role: 'student' | 'evaluator', isoDate: string) => {
    lastMaintenanceAtRef.current = isoDate;
    localStorage.setItem(getMaintenanceNotificationKey(role), isoDate);
  };

  useEffect(() => {
    if (!activeRole) {
      setMaintenanceStatus(null);
      return;
    }

    const nowIso = new Date().toISOString();
    lastPrimaryAtRef.current = localStorage.getItem(getPrimaryNotificationKey(activeRole)) || nowIso;
    lastMaintenanceAtRef.current = localStorage.getItem(getMaintenanceNotificationKey(activeRole)) || nowIso;

    let isCancelled = false;

    const pollNotifications = async () => {
      try {
        const response = await api.get(
          activeRole === 'student'
            ? '/system/student-notifications'
            : '/system/evaluator-notifications',
          {
            params: activeRole === 'student'
              ? {
                  sinceTaskAt: lastPrimaryAtRef.current || undefined,
                  sinceMaintenanceAt: lastMaintenanceAtRef.current || undefined,
                }
              : {
                  sinceSubmissionAt: lastPrimaryAtRef.current || undefined,
                  sinceMaintenanceAt: lastMaintenanceAtRef.current || undefined,
                }
          }
        );

        if (isCancelled) return;

        const payload = response.data || {};
        const currentMaintenance: MaintenanceStatus | null = payload.maintenanceStatus || null;
        const maintenanceEvent: MaintenanceStatus | null = payload.maintenanceEvent || null;

        setMaintenanceStatus(currentMaintenance);

        if (activeRole === 'student') {
          const newTasks = Array.isArray(payload.newTasks) ? payload.newTasks : [];

          if (newTasks.length > 0) {
            const chronologicalTasks = [...newTasks].reverse();
            let newestPrimaryAt = lastPrimaryAtRef.current;

            for (const task of chronologicalTasks) {
              const taskCreatedAt = safeToISOString(task?.createdAt) || new Date().toISOString();
              if (!newestPrimaryAt || taskCreatedAt > newestPrimaryAt) {
                newestPrimaryAt = taskCreatedAt;
              }

              const normalizedTaskId = String(task?._id || '');
              if (normalizedTaskId) {
                taskNotificationRef.current?.({
                  id: normalizedTaskId,
                  taskId: normalizedTaskId,
                  title: String(task?.title || 'New assignment'),
                  deadline: task?.deadline ? String(task.deadline) : null,
                  createdAt: taskCreatedAt
                });
              }

              const dueText = task?.deadline ? `Due ${formatDueDate(task.deadline)}` : 'Task available now';
              const body = `${task?.title || 'New assignment'} • ${dueText}`;

              pushToast('New Task Assigned', body, 'task');
              triggerBrowserNotification('New Task Assigned', body);
            }

            if (newestPrimaryAt) {
              updateLastPrimaryAt(activeRole, newestPrimaryAt);
            }
          }
        } else {
          const newSubmissions = Array.isArray(payload.newSubmissions) ? payload.newSubmissions : [];

          if (newSubmissions.length > 0) {
            const chronologicalSubmissions = [...newSubmissions].reverse();
            let newestPrimaryAt = lastPrimaryAtRef.current;

            for (const submission of chronologicalSubmissions) {
              const submittedAt = safeToISOString(submission?.submittedAt) || new Date().toISOString();
              if (!newestPrimaryAt || submittedAt > newestPrimaryAt) {
                newestPrimaryAt = submittedAt;
              }

              const normalizedSubmissionId = String(submission?._id || submission?.submissionId || '');
              const normalizedTaskId = String(submission?.taskId || '');
              const studentName = String(submission?.studentName || 'A student');
              const taskTitle = String(submission?.taskTitle || 'Assigned task');

              if (normalizedSubmissionId && normalizedTaskId) {
                evaluatorNotificationRef.current?.({
                  id: normalizedSubmissionId,
                  submissionId: normalizedSubmissionId,
                  taskId: normalizedTaskId,
                  taskTitle,
                  studentName,
                  submittedAt
                });
              }

              const body = `${studentName} submitted assignment • ${taskTitle}`;
              pushToast('New Submission', body, 'submission');
              triggerBrowserNotification('New Submission', body);
            }

            if (newestPrimaryAt) {
              updateLastPrimaryAt(activeRole, newestPrimaryAt);
            }
          }
        }

        if (maintenanceEvent?.updatedAt) {
          const maintenanceUpdatedAt = safeToISOString(maintenanceEvent.updatedAt) || new Date().toISOString();
          updateLastMaintenanceAt(activeRole, maintenanceUpdatedAt);

          const title = maintenanceEvent.enabled ? 'Under Maintenance' : 'Maintenance Ended';
          const body = maintenanceEvent.message || (maintenanceEvent.enabled
            ? 'The site is currently under maintenance.'
            : 'Maintenance has ended.');

          pushToast(title, body, 'maintenance');
          triggerBrowserNotification(title, body);
        }
      } catch (_) {
        // Silent failure to avoid interrupting the current workflow.
      }
    };

    pollNotifications();
    const intervalId = window.setInterval(pollNotifications, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeRole]);

  const requestPermission = async () => {
    if (!supportsBrowserNotifications()) {
      setPermission('unsupported');
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermissionState);
      if (result !== 'default') {
        setIsPromptDismissed(true);
        localStorage.setItem(NOTIFICATION_PROMPT_DISMISSED_KEY, '1');
      }
    } catch (_) {
      setPermission('denied');
    }
  };

  const dismissPrompt = () => {
    setIsPromptDismissed(true);
    localStorage.setItem(NOTIFICATION_PROMPT_DISMISSED_KEY, '1');
  };

  if (!activeRole) return null;

  const permissionPromptText = activeRole === 'student'
    ? 'Allow browser notifications to get instant alerts for newly assigned tasks and maintenance updates.'
    : 'Allow browser notifications to get instant alerts when students submit assignments and for maintenance updates.';

  return (
    <>
      {maintenanceStatus?.enabled && (
        <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-300">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
            <Wrench size={14} />
            Under Maintenance
          </div>
          <p className="mt-2 text-xs font-bold leading-relaxed">
            {maintenanceStatus.message || 'The site is currently under maintenance.'}
          </p>
        </div>
      )}

      {shouldShowPermissionPrompt && (
        <div className="mb-4 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-4 text-blue-300">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
              <BellRing size={14} />
              Real-Time Alerts
            </div>
            <button
              onClick={dismissPrompt}
              className="rounded-lg p-1 text-blue-300/70 hover:text-blue-200 hover:bg-blue-500/10 transition-colors"
              aria-label="Dismiss notification prompt"
            >
              <X size={14} />
            </button>
          </div>
          <p className="mt-2 text-xs font-bold leading-relaxed">
            {permissionPromptText}
          </p>
          <button
            onClick={requestPermission}
            className="mt-3 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white theme-bg-primary hover:opacity-95 transition-opacity"
          >
            Enable Alerts
          </button>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[90] space-y-2 w-[calc(100%-2rem)] max-w-sm">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-2xl border px-4 py-3 shadow-xl backdrop-blur ${
                toast.kind === 'maintenance'
                  ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                  : 'border-blue-500/20 bg-blue-500/10 text-blue-200'
              }`}
            >
              <p className="text-[10px] font-black uppercase tracking-widest">{toast.title}</p>
              <p className="mt-1 text-xs font-bold leading-relaxed break-words">{toast.message}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default StudentRealtimeNotifier;
