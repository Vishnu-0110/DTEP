
import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme, ThemeType } from '../context/ThemeContext';
import api from '../services/api';
import { useBodyScrollLock } from '../utils/useBodyScrollLock';
import { saveLastRouteForUser } from '../utils/navigationPersistence';
import StudentRealtimeNotifier, {
  EvaluatorSubmissionNotification,
  StudentTaskNotification
} from '../components/StudentRealtimeNotifier';
import { 
  LayoutDashboard, 
  Users, 
  ClipboardList, 
  GraduationCap, 
  LogOut, 
  Menu, 
  X, 
  Bell,
  ChevronRight,
  Palette,
  Check,
  Moon,
  Sun,
  Wrench
} from 'lucide-react';

type StudentTaskNotificationItem = StudentTaskNotification & { read: boolean };
type EvaluatorSubmissionNotificationItem = EvaluatorSubmissionNotification & { read: boolean };

const STUDENT_TASK_NOTIFICATION_KEY = 'dtep_student_task_notifications';
const STUDENT_TASK_NOTIFICATION_LIMIT = 50;
const EVALUATOR_SUBMISSION_NOTIFICATION_KEY = 'dtep_evaluator_submission_notifications';
const EVALUATOR_SUBMISSION_NOTIFICATION_LIMIT = 50;
const MAINTENANCE_POLL_INTERVAL_MS = 15000;

type MaintenanceStatus = {
  enabled: boolean;
  message: string;
  updatedAt?: string | null;
};

const formatNotificationDue = (deadline: string | null) => {
  if (!deadline) return 'Open task details';
  const date = new Date(deadline);
  if (!Number.isFinite(date.getTime())) return 'Open task details';
  return `Due ${date.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const formatSubmissionNotificationMeta = (taskTitle: string, submittedAt: string) => {
  const date = new Date(submittedAt);
  const submittedLabel = Number.isFinite(date.getTime())
    ? `Submitted ${date.toLocaleString(undefined, {
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'Open submission review';

  return taskTitle ? `${taskTitle} • ${submittedLabel}` : submittedLabel;
};

const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, setTheme, mode, toggleMode } = useTheme();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
  const [maintenanceStatus, setMaintenanceStatus] = useState<MaintenanceStatus | null>(null);
  const [studentTaskNotifications, setStudentTaskNotifications] = useState<StudentTaskNotificationItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STUDENT_TASK_NOTIFICATION_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(Boolean).slice(0, STUDENT_TASK_NOTIFICATION_LIMIT);
    } catch (_) {
      return [];
    }
  });
  const [evaluatorSubmissionNotifications, setEvaluatorSubmissionNotifications] = useState<EvaluatorSubmissionNotificationItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(EVALUATOR_SUBMISSION_NOTIFICATION_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(Boolean).slice(0, EVALUATOR_SUBMISSION_NOTIFICATION_LIMIT);
    } catch (_) {
      return [];
    }
  });
  const navigate = useNavigate();
  const location = useLocation();
  const notificationMenuRef = useRef<HTMLDivElement | null>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);

  const isStudent = user?.role === 'student';
  const isEvaluator = user?.role === 'evaluator';
  const shouldEnforceMaintenance = isStudent || isEvaluator;
  const unreadStudentTaskCount = studentTaskNotifications.filter((item) => !item.read).length;
  const unreadEvaluatorSubmissionCount = evaluatorSubmissionNotifications.filter((item) => !item.read).length;
  const unreadNotificationCount = isStudent
    ? unreadStudentTaskCount
    : (isEvaluator ? unreadEvaluatorSubmissionCount : 0);

  useBodyScrollLock(isSidebarOpen);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleStudentTaskNotification = (incoming: StudentTaskNotification) => {
    setStudentTaskNotifications((prev) => {
      if (!incoming?.id || prev.some((item) => item.id === incoming.id)) {
        return prev;
      }

      return [
        { ...incoming, read: false },
        ...prev
      ]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, STUDENT_TASK_NOTIFICATION_LIMIT);
    });
  };

  const handleEvaluatorSubmissionNotification = (incoming: EvaluatorSubmissionNotification) => {
    setEvaluatorSubmissionNotifications((prev) => {
      if (!incoming?.id || prev.some((item) => item.id === incoming.id)) {
        return prev;
      }

      return [
        { ...incoming, read: false },
        ...prev
      ]
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
        .slice(0, EVALUATOR_SUBMISSION_NOTIFICATION_LIMIT);
    });
  };

  const handleStudentNotificationClick = (notification: StudentTaskNotificationItem) => {
    setStudentTaskNotifications((prev) =>
      prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item))
    );
    setIsNotificationMenuOpen(false);
    navigate(`/task/${notification.taskId}`);
  };

  const handleEvaluatorNotificationClick = (notification: EvaluatorSubmissionNotificationItem) => {
    setEvaluatorSubmissionNotifications((prev) =>
      prev.map((item) => (item.id === notification.id ? { ...item, read: true } : item))
    );
    setIsNotificationMenuOpen(false);
    navigate(`/evaluator/submissions/${notification.taskId}`, {
      state: { activeSubmissionId: notification.submissionId }
    });
  };

  const markAllStudentNotificationsRead = () => {
    setStudentTaskNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  const markAllEvaluatorNotificationsRead = () => {
    setEvaluatorSubmissionNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  useEffect(() => {
    setIsThemeMenuOpen(false);
    setIsNotificationMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user?.id) return;
    saveLastRouteForUser(user.id, location.pathname);
  }, [location.pathname, user?.id]);

  useEffect(() => {
    if (!isNotificationMenuOpen && !isThemeMenuOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const inNotificationMenu = Boolean(notificationMenuRef.current?.contains(target));
      const inThemeMenu = Boolean(themeMenuRef.current?.contains(target));

      if (!inNotificationMenu && !inThemeMenu) {
        setIsNotificationMenuOpen(false);
        setIsThemeMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNotificationMenuOpen(false);
        setIsThemeMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('touchstart', handlePointerDown, true);
    document.addEventListener('keydown', handleEscape, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('touchstart', handlePointerDown, true);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isNotificationMenuOpen, isThemeMenuOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STUDENT_TASK_NOTIFICATION_KEY, JSON.stringify(studentTaskNotifications));
  }, [studentTaskNotifications]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(EVALUATOR_SUBMISSION_NOTIFICATION_KEY, JSON.stringify(evaluatorSubmissionNotifications));
  }, [evaluatorSubmissionNotifications]);

  useEffect(() => {
    if (!shouldEnforceMaintenance) {
      setMaintenanceStatus(null);
      return;
    }

    let isCancelled = false;
    let timeoutId: number | null = null;
    let networkFailureCount = 0;

    const scheduleNextPoll = (hadNetworkError: boolean) => {
      if (isCancelled) return;
      const nextDelay = hadNetworkError
        ? Math.min(MAINTENANCE_POLL_INTERVAL_MS * 2 ** networkFailureCount, 60000)
        : MAINTENANCE_POLL_INTERVAL_MS;
      timeoutId = window.setTimeout(fetchMaintenanceStatus, nextDelay);
    };

    const fetchMaintenanceStatus = async () => {
      let hadNetworkError = false;
      try {
        const response = await api.get('/system/maintenance');
        if (isCancelled) return;
        networkFailureCount = 0;
        setMaintenanceStatus({
          enabled: Boolean(response.data?.enabled),
          message: String(response.data?.message || '').trim(),
          updatedAt: response.data?.updatedAt || null,
        });
      } catch (error: any) {
        if (isCancelled) return;

        if (error?.response?.status === 503 && error?.response?.data?.maintenance) {
          networkFailureCount = 0;
          const maintenance = error.response.data.maintenance;
          setMaintenanceStatus({
            enabled: Boolean(maintenance.enabled),
            message: String(maintenance.message || '').trim(),
            updatedAt: maintenance.updatedAt || null,
          });
        } else {
          hadNetworkError = !error?.response;
          if (hadNetworkError) {
            networkFailureCount = Math.min(networkFailureCount + 1, 4);
          } else {
            networkFailureCount = 0;
          }
          setMaintenanceStatus(null);
        }
      } finally {
        if (!isCancelled) {
          scheduleNextPoll(hadNetworkError);
        }
      }
    };

    fetchMaintenanceStatus();

    return () => {
      isCancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [shouldEnforceMaintenance]);

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} />, roles: ['admin', 'evaluator', 'student'] },
    { label: 'Manage Users', path: '/admin/users', icon: <Users size={20} />, roles: ['admin'] },
    { label: 'Tasks', path: '/evaluator/tasks', icon: <ClipboardList size={20} />, roles: ['evaluator'] },
    { label: 'My Tasks', path: '/student/tasks', icon: <GraduationCap size={20} />, roles: ['student'] },
  ];

  const filteredNavItems = navItems.filter(item => item.roles.includes(user?.role || ''));

  const themes: { id: ThemeType; label: string; color: string }[] = [
    { id: 'midnight', label: 'Midnight', color: 'bg-blue-600' },
    { id: 'emerald', label: 'Emerald', color: 'bg-emerald-500' },
    { id: 'cyberpunk', label: 'Cyberpunk', color: 'bg-pink-500' },
    { id: 'sunset', label: 'Sunset', color: 'bg-amber-500' },
    { id: 'slate', label: 'Slate', color: 'bg-slate-400' },
  ];

  if (shouldEnforceMaintenance && maintenanceStatus?.enabled) {
    const updatedAtLabel = maintenanceStatus.updatedAt
      ? new Date(maintenanceStatus.updatedAt).toLocaleString()
      : null;

    return (
      <div className="min-h-screen relative overflow-hidden bg-app text-adaptive-main">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.18),transparent_32%),radial-gradient(circle_at_bottom,rgba(15,23,42,0.18),transparent_40%)]"></div>
        <div className="relative min-h-screen flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-3xl glass-card rounded-[32px] sm:rounded-[40px] border border-amber-500/20 shadow-2xl p-6 sm:p-8 lg:p-12">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-[28px] bg-amber-500/12 border border-amber-500/25 flex items-center justify-center text-amber-400 shadow-sm">
                <Wrench size={36} />
              </div>
              <p className="mt-6 text-[11px] font-black uppercase tracking-[0.35em] text-amber-400">
                Maintenance Mode
              </p>
              <h1 className="mt-3 text-2xl sm:text-4xl lg:text-5xl font-black tracking-tighter leading-tight">
                Portal Access Is Temporarily Disabled
              </h1>
              <p className="mt-6 text-base sm:text-lg leading-relaxed text-adaptive-sub font-medium max-w-2xl whitespace-pre-line opacity-60">
                {maintenanceStatus.message || 'The portal is currently under maintenance. Please return once the administrator reopens access.'}
              </p>
              {updatedAtLabel && (
                <p className="mt-6 text-[10px] font-black uppercase tracking-[0.25em] text-adaptive-sub">
                  Last Updated {updatedAtLabel}
                </p>
              )}
              <div className="mt-8 w-full rounded-[28px] border border-amber-500/15 bg-amber-500/8 px-6 py-5 text-left">
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-400">Notice</p>
                <p className="mt-2 text-sm leading-relaxed text-adaptive-sub font-medium">
                  Evaluator and student features are blocked until maintenance mode is turned off by an administrator.
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="mt-8 btn-primary rounded-2xl px-8 py-4 text-[10px] font-black uppercase tracking-[0.25em] active:scale-95"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-app text-adaptive-main overflow-x-hidden transition-colors duration-300">
      {/* Sidebar - Mobile & Desktop */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[280px] lg:w-72 glass-card overscroll-contain transform transition-transform duration-500 ease-in-out lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full shadow-none'} border-r border-white/5`}>
        <div className="flex flex-col h-full">
          <div className="p-6 lg:p-8 flex items-center justify-between">
            <Link to="/dashboard" onClick={() => setIsSidebarOpen(false)}>
              <h1 className="text-2xl lg:text-3xl font-black tracking-tighter italic text-adaptive-main drop-shadow-[0_1px_0_rgba(255,255,255,0.08)]">
                DTE <span className="theme-text-primary">PORTAL</span>
              </h1>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] theme-text-primary mt-1">Task Portal</p>
            </Link>
            <button className="lg:hidden text-adaptive-sub p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors active:scale-90" onClick={() => setIsSidebarOpen(false)}>
              <X size={24} />
            </button>
          </div>

          <nav className="flex-1 px-4 lg:px-6 space-y-1.5 mt-4 overflow-y-auto overscroll-contain custom-scrollbar">
            {filteredNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsSidebarOpen(false)}
                className={`flex items-center justify-between group px-4 py-3.5 rounded-2xl transition-all duration-300 ${
                  location.pathname === item.path 
                    ? 'theme-bg-primary text-white shadow-xl theme-shadow-primary' 
                    : 'hover:bg-black/5 dark:hover:bg-white/5 text-adaptive-sub hover:text-adaptive-main'
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className={`transition-colors duration-300 ${location.pathname === item.path ? 'text-white' : 'theme-text-primary'}`}>{item.icon}</span>
                  <span className="font-bold tracking-tight text-sm">{item.label}</span>
                </div>
                <ChevronRight size={14} className={`opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all ${location.pathname === item.path ? 'opacity-100' : ''}`} />
              </Link>
            ))}
          </nav>

          <div className="p-4 lg:p-6 border-t border-white/5 bg-adaptive-nested/50">
            <button 
              onClick={handleLogout}
              className="flex items-center gap-4 w-full px-5 py-3.5 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-2xl transition-all font-bold group active:scale-95"
            >
              <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
              <span className="text-sm">Sign Out</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:ml-72 min-w-0">
        <header className="h-16 lg:h-20 glass-card sticky top-0 z-40 px-3 sm:px-4 lg:px-10 flex items-center justify-between border-b border-white/5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-adaptive-main p-2.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors active:scale-95" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="hidden sm:flex flex-col">
              <h2 className="text-[10px] font-black text-adaptive-sub uppercase tracking-widest leading-none mb-1">System</h2>
              <div className="flex items-center gap-1.5 font-bold text-xs theme-text-primary">
                <span className="w-1.5 h-1.5 rounded-full theme-bg-primary animate-pulse"></span>
                ONLINE
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-3 min-w-0">
            <button 
                onClick={toggleMode}
                className="p-2 sm:p-2.5 text-adaptive-sub hover:theme-text-primary transition-all bg-black/5 dark:bg-white/5 rounded-xl border border-white/5 group active:scale-95"
                title={`Switch to ${mode === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
                {mode === 'dark' ? <Sun size={18} className="group-hover:rotate-45 transition-transform" /> : <Moon size={18} className="group-hover:-rotate-12 transition-transform" />}
            </button>

            <div className="relative" ref={themeMenuRef}>
                <button 
                    onClick={() => {
                      setIsThemeMenuOpen((prev) => !prev);
                      setIsNotificationMenuOpen(false);
                    }}
                    className="p-2 sm:p-2.5 text-adaptive-sub hover:theme-text-primary transition-all bg-black/5 dark:bg-white/5 rounded-xl border border-white/5 flex items-center gap-2 group active:scale-95"
                >
                    <Palette size={18} className="group-hover:rotate-12 transition-transform" />
                    <span className="hidden md:inline text-[9px] font-black uppercase tracking-widest">Theme</span>
                </button>
                
                {isThemeMenuOpen && (
                    <div className="absolute top-14 right-0 w-44 max-w-[calc(100vw-1rem)] glass-card rounded-2xl p-2.5 shadow-2xl border border-white/10 z-20 animate-in fade-in zoom-in-95 duration-200">
                        <p className="text-[9px] font-black text-adaptive-sub uppercase tracking-[0.2em] mb-2 px-2">Choose Theme</p>
                        <div className="space-y-0.5">
                            {themes.map((t) => (
                                <button 
                                    key={t.id}
                                    onClick={() => { setTheme(t.id); setIsThemeMenuOpen(false); }}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all ${theme === t.id ? 'bg-adaptive-nested' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full ${t.color}`}></div>
                                        <span className={`text-[11px] font-bold ${theme === t.id ? 'text-adaptive-main' : 'text-adaptive-sub'}`}>{t.label}</span>
                                    </div>
                                    {theme === t.id && <Check size={12} className="theme-text-primary" />}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {isStudent || isEvaluator ? (
              <div className="relative" ref={notificationMenuRef}>
                <button
                  onClick={() => {
                    setIsNotificationMenuOpen((prev) => !prev);
                    setIsThemeMenuOpen(false);
                  }}
                  className="relative p-2 sm:p-2.5 text-adaptive-sub hover:theme-text-primary transition-all bg-black/5 dark:bg-white/5 rounded-xl border border-white/5 active:scale-95"
                  aria-label={isStudent ? 'Student notifications' : 'Evaluator notifications'}
                >
                  <Bell size={18} />
                  {unreadNotificationCount > 0 ? (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center border border-app">
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </span>
                  ) : (
                    <span className="absolute top-2 right-2 w-1.5 h-1.5 theme-bg-primary rounded-full border border-app animate-pulse"></span>
                  )}
                </button>

                {isNotificationMenuOpen && (
                  <div className="absolute top-14 right-0 w-[calc(100vw-1rem)] max-w-[320px] glass-card rounded-2xl p-3 shadow-2xl border border-white/10 z-20 animate-in fade-in zoom-in-95 duration-200">
                      <div className="flex items-center justify-between gap-2 px-1 pb-2 border-b border-white/10 mb-2">
                        <p className="text-[9px] font-black text-adaptive-sub uppercase tracking-[0.2em]">
                          {isStudent ? 'Assignments' : 'Submissions'}
                        </p>
                        {(isStudent ? studentTaskNotifications.length > 0 : evaluatorSubmissionNotifications.length > 0) && (
                          <button
                            onClick={isStudent ? markAllStudentNotificationsRead : markAllEvaluatorNotificationsRead}
                            className="rounded-lg border border-white/10 bg-adaptive-nested px-2.5 py-1 text-[9px] font-black uppercase tracking-widest theme-text-primary transition-colors hover:theme-bg-primary hover:text-white active:theme-bg-primary active:text-white"
                          >
                            Mark All Read
                          </button>
                        )}
                      </div>

                      {(isStudent ? studentTaskNotifications.length : evaluatorSubmissionNotifications.length) === 0 ? (
                        <p className="text-[10px] font-bold text-adaptive-sub px-2 py-6 text-center uppercase tracking-widest opacity-60">
                          {isStudent ? 'No new assignments' : 'No new submissions'}
                        </p>
                      ) : (
                        <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                          {isStudent
                            ? studentTaskNotifications.map((notification) => (
                                <button
                                  key={notification.id}
                                  onClick={() => handleStudentNotificationClick(notification)}
                                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                                    notification.read
                                      ? 'border-white/10 bg-adaptive-nested hover:bg-black/5 dark:hover:bg-white/5'
                                      : 'border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20'
                                  }`}
                                >
                                  <p className="text-[11px] font-black text-adaptive-main tracking-tight line-clamp-1">
                                    {notification.title}
                                  </p>
                                  <p className="text-[9px] font-bold text-adaptive-sub uppercase tracking-widest mt-1">
                                    {formatNotificationDue(notification.deadline)}
                                  </p>
                                </button>
                              ))
                            : evaluatorSubmissionNotifications.map((notification) => (
                                <button
                                  key={notification.id}
                                  onClick={() => handleEvaluatorNotificationClick(notification)}
                                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                                    notification.read
                                      ? 'border-white/10 bg-adaptive-nested hover:bg-black/5 dark:hover:bg-white/5'
                                      : 'border-blue-500/20 bg-blue-500/10 hover:bg-blue-500/20'
                                  }`}
                                >
                                  <p className="text-[11px] font-black text-adaptive-main tracking-tight line-clamp-1">
                                    {notification.studentName} submitted assignment
                                  </p>
                                  <p className="text-[9px] font-bold text-adaptive-sub uppercase tracking-widest mt-1 line-clamp-2">
                                    {formatSubmissionNotificationMeta(notification.taskTitle, notification.submittedAt)}
                                  </p>
                                </button>
                              ))}
                        </div>
                      )}
                    </div>
                )}
              </div>
            ) : null}
            
            <div className="flex min-w-0 items-center gap-2 sm:gap-3 bg-black/5 dark:bg-white/5 pl-1.5 sm:pl-4 pr-1 py-1 rounded-2xl border border-white/5">
                <div className="text-right hidden sm:block">
                    <p className="text-[11px] font-black text-adaptive-main leading-none truncate max-w-[80px]">{user?.name}</p>
                    <p className="text-[9px] font-black theme-text-primary uppercase tracking-tighter mt-1">{user?.role}</p>
                </div>
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--primary))] to-[rgb(var(--accent))] flex items-center justify-center font-black text-white text-sm border border-white/20 shadow-lg shrink-0">
                    {user?.name?.charAt(0)}
                </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-6 lg:p-10 overflow-y-auto custom-scrollbar">
          <div className="max-w-[1600px] mx-auto">
            <StudentRealtimeNotifier
              onTaskNotification={handleStudentTaskNotification}
              onEvaluatorSubmissionNotification={handleEvaluatorSubmissionNotification}
            />
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 modal-overlay z-40 lg:hidden transition-opacity animate-in fade-in duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default Layout;
