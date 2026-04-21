import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList
} from 'recharts';
import {
  CheckCircle,
  Clock,
  FileText,
  AlertCircle,
  DatabaseZap,
  TrendingUp,
  ChevronRight
} from 'lucide-react';
import StatCard from '../components/StatCard';
import api from '../services/api';
import { getScoreTone } from '../utils/scoreTone';

const LogsModal = lazy(() => import('../components/LogsModal'));

type ChartPoint = {
  name: string;
  count: number;
  tone?: 'open' | 'pending' | 'reviewed' | 'missed';
};

const getChartCopy = (role: string | undefined) => {
  if (role === 'admin') {
    return {
      title: 'Assignment Flow',
      description: 'Live platform workload across open tasks, review queue, graded work, and missed deadlines.',
    };
  }

  if (role === 'evaluator') {
    return {
      title: 'Review Pipeline',
      description: 'Owned assignments grouped by what still needs attention and what already closed out.',
    };
  }

  return {
    title: 'My Progress',
    description: 'A clean snapshot of open work, pending reviews, completed assignments, and missed deadlines.',
  };
};

const getChartBarFill = (point: ChartPoint, primaryFill: string) => {
  if (point.tone === 'pending') return '#f59e0b';
  if (point.tone === 'reviewed') return '#10b981';
  if (point.tone === 'missed') return '#f43f5e';
  return primaryFill;
};

const Dashboard: React.FC = () => {
  const { user, isDemoMode } = useAuth();
  const { mode } = useTheme();
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [stats, setStats] = useState<any[]>([]);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 1280 : window.innerWidth
  );

  const buildStats = (role: string | undefined, totals: any) => {
    if (!role || !totals) return [];

    if (role === 'admin') {
      return [
        {
          label: 'Total Users',
          value: totals.totalUsers ?? 0,
          icon: <CheckCircle className="text-emerald-400" />,
          sub: `${totals.totalAdmins ?? 0} admins`
        },
        {
          label: 'Evaluators',
          value: totals.totalEvaluators ?? 0,
          icon: <Clock className="text-sky-400" />,
          sub: `${totals.totalStudents ?? 0} students`
        },
        {
          label: 'Submitted Work',
          value: totals.totalSubmissions ?? 0,
          icon: <FileText className="theme-text-primary" />,
          sub: `${totals.totalTasks ?? 0} tasks`
        },
        {
          label: 'Pending Review',
          value: totals.pendingSubmissions ?? 0,
          icon: <AlertCircle className="text-amber-400" />,
          sub: `${totals.evaluatedSubmissions ?? 0} reviewed`
        },
      ];
    }

    if (role === 'evaluator') {
      const submissionsTotal = typeof totals.submissionsTotal === 'number' ? totals.submissionsTotal : 0;
      const evaluatedSubmissions = typeof totals.evaluatedSubmissions === 'number' ? totals.evaluatedSubmissions : 0;
      const reviewRateScore = submissionsTotal > 0
        ? Math.round((evaluatedSubmissions / submissionsTotal) * 100)
        : null;
      const reviewRate = reviewRateScore !== null ? `${reviewRateScore}%` : 'N/A';
      return [
        {
          label: 'My Tasks',
          value: totals.tasksCreated ?? 0,
          icon: <CheckCircle className="text-emerald-400" />,
          sub: `${totals.openTasks ?? 0} active`
        },
        {
          label: 'Submitted Work',
          value: totals.submissionsTotal ?? 0,
          icon: <FileText className="text-sky-400" />,
          sub: `${totals.evaluatedSubmissions ?? 0} reviewed`
        },
        {
          label: 'Pending Review',
          value: totals.pendingSubmissions ?? 0,
          icon: <Clock className="text-amber-400" />,
          sub: `${totals.missedSubmissions ?? 0} missed`
        },
        {
          label: 'Review Rate',
          value: reviewRate,
          valueClassName: getScoreTone(reviewRateScore).valueTextClass,
          icon: <TrendingUp className="theme-text-primary" />,
          sub: submissionsTotal > 0 ? `${evaluatedSubmissions}/${submissionsTotal} reviewed` : 'No submissions yet'
        },
      ];
    }

    if (role === 'student') {
      const avgScore = typeof totals.avgMarks === 'number' ? Math.round(totals.avgMarks) : null;
      const avg = avgScore !== null ? `${avgScore}%` : 'N/A';
      const deadline = totals.nextDeadline ? new Date(totals.nextDeadline).toLocaleDateString() : 'No upcoming';
      return [
        {
          label: 'Tasks Available',
          value: totals.tasksAvailable ?? 0,
          icon: <FileText className="text-sky-400" />,
          sub: `${totals.totalAssignedTasks ?? 0} total`
        },
        {
          label: 'My Submissions',
          value: totals.mySubmissions ?? 0,
          icon: <CheckCircle className="text-emerald-400" />,
          sub: `${totals.myEvaluated ?? 0} reviewed`
        },
        {
          label: 'Pending Reviews',
          value: totals.myPending ?? 0,
          icon: <Clock className="text-amber-400" />,
          sub: `${totals.missedTasks ?? 0} missed`
        },
        {
          label: 'Avg Grade',
          value: avg,
          valueClassName: getScoreTone(avgScore).valueTextClass,
          icon: <TrendingUp className="theme-text-primary" />,
          sub: `Next: ${deadline}`
        },
      ];
    }

    return [];
  };

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    setError('');

    api.get('/stats/summary')
      .then((response) => {
        const payload = response.data || {};
        setStats(buildStats(user.role, payload.totals));
        setChartData(Array.isArray(payload.chart) ? payload.chart : []);
      })
      .catch((err) => {
        const msg = err.response?.data?.message || 'Failed to load dashboard stats.';
        setError(msg);
        setStats([]);
        setChartData([]);
      })
      .finally(() => setIsLoading(false));
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '59, 130, 246';
  const primaryFill = `rgb(${primaryColor})`;
  const gridColor = mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.08)';
  const axisColor = mode === 'dark' ? 'rgba(248,250,252,0.78)' : 'rgba(15,23,42,0.72)';
  const labelColor = mode === 'dark' ? '#f8fafc' : '#0f172a';
  const tooltipBg = mode === 'dark' ? '#0f172a' : '#ffffff';
  const tooltipText = mode === 'dark' ? '#f8fafc' : '#0f172a';
  const chartCopy = getChartCopy(user?.role);
  const isCompactViewport = viewportWidth < 640;
  const isTabletViewport = viewportWidth < 1024;

  return (
    <div className="space-y-6 lg:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {isDemoMode && (
        <div className="bg-amber-500/10 border border-amber-500/20 p-4 sm:p-5 rounded-2xl sm:rounded-3xl flex items-start sm:items-center gap-4 text-amber-500 shadow-sm">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/10">
            <DatabaseZap size={20} />
          </div>
          <div className="text-sm">
            <p className="font-black uppercase tracking-widest text-[9px] mb-0.5">Sandbox Mode</p>
            <p className="font-medium opacity-80 leading-snug">Showing demo data.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 sm:p-5 rounded-2xl sm:rounded-3xl flex items-start sm:items-center gap-4 text-red-500 shadow-sm">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/10">
            <AlertCircle size={20} />
          </div>
          <div className="text-sm">
            <p className="font-black uppercase tracking-widest text-[9px] mb-0.5">Dashboard Error</p>
            <p className="font-medium opacity-80 leading-snug">{error}</p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-5xl font-black text-adaptive-main tracking-tighter leading-tight">Dashboard</h1>
          <p className="text-adaptive-sub mt-1 text-sm sm:text-lg font-medium">Overview of your tasks and submissions.</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-adaptive-nested px-4 py-2 rounded-2xl border border-white/10 shadow-sm">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          <span className="text-[10px] font-black text-adaptive-main uppercase tracking-widest">System Online</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {isLoading ? (
          <div className="col-span-full flex items-center justify-center py-10 text-adaptive-sub text-xs font-bold uppercase tracking-widest">
            Loading dashboard stats...
          </div>
        ) : (
          stats.map((stat, i) => (
            <StatCard key={i} {...stat} className="shadow-lg hover:translate-y-[-2px] transition-all" />
          ))
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
        <div className={`${user?.role === 'admin' ? 'xl:col-span-2' : 'xl:col-span-3'} glass-card p-5 sm:p-8 rounded-3xl lg:rounded-[40px] shadow-sm border border-white/10`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 mb-6 sm:mb-8">
            <div className="space-y-1">
              <h3 className="text-lg sm:text-xl font-black text-adaptive-main tracking-tight">{chartCopy.title}</h3>
              <p className="text-adaptive-sub text-sm font-medium max-w-2xl">{chartCopy.description}</p>
            </div>
            <div className="px-4 py-2 rounded-2xl bg-adaptive-nested border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] theme-text-primary">
              Current Snapshot
            </div>
          </div>

          <div className="h-[240px] sm:h-[320px] lg:h-[360px] w-full">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center rounded-3xl bg-adaptive-nested border border-dashed border-white/10 text-adaptive-sub text-xs font-black uppercase tracking-widest">
                No chart data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{
                    top: 18,
                    right: isCompactViewport ? 4 : 12,
                    left: isCompactViewport ? -24 : -8,
                    bottom: isCompactViewport ? 18 : 0
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke={axisColor}
                    fontSize={isCompactViewport ? 10 : 11}
                    fontWeight="900"
                    tickLine={false}
                    axisLine={false}
                    dy={isCompactViewport ? 6 : 10}
                    interval={0}
                    angle={isCompactViewport && chartData.length > 3 ? -18 : 0}
                    textAnchor={isCompactViewport && chartData.length > 3 ? 'end' : 'middle'}
                    height={isCompactViewport && chartData.length > 3 ? 48 : 30}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke={axisColor}
                    fontSize={isCompactViewport ? 10 : 11}
                    fontWeight="900"
                    tickLine={false}
                    axisLine={false}
                    width={isCompactViewport ? 28 : 36}
                  />
                  <Tooltip
                    cursor={{ fill: gridColor }}
                    formatter={(value: number) => [`${value}`, 'Count']}
                    contentStyle={{
                      backgroundColor: tooltipBg,
                      borderRadius: '16px',
                      border: '1px solid rgba(148, 163, 184, 0.18)',
                      color: tooltipText,
                      fontSize: '12px',
                      padding: '12px',
                      boxShadow: '0 10px 30px -10px rgba(0,0,0,0.45)'
                    }}
                    labelStyle={{ color: tooltipText, fontWeight: 800, marginBottom: '6px' }}
                    itemStyle={{ color: tooltipText }}
                  />
                  <Bar dataKey="count" radius={[14, 14, 6, 6]} maxBarSize={isTabletViewport ? 44 : 58}>
                    {!isCompactViewport && (
                      <LabelList dataKey="count" position="top" fill={labelColor} fontSize={11} fontWeight={900} />
                    )}
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={getChartBarFill(entry, primaryFill)}
                        className="transition-all cursor-pointer"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {user?.role === 'admin' && (
          <div className="glass-card p-6 sm:p-8 rounded-3xl lg:rounded-[40px] shadow-sm border border-white/10 flex flex-col min-h-[400px]">
            <h3 className="text-lg sm:text-xl font-black text-adaptive-main tracking-tight mb-6">Recent Activity</h3>
            <div className="space-y-3.5 flex-1">
              {[
                { label: 'Data Sync', time: '5m', color: 'bg-emerald-500' },
                { label: 'File Check', time: '18m', color: 'bg-amber-500' },
                { label: 'Auth Cleanup', time: '1h', color: 'bg-rose-500' },
                { label: 'Server Load', time: '2h', color: 'theme-bg-primary' }
              ].map((task, i) => (
                <div key={i} className="flex items-center gap-4 p-4 bg-adaptive-nested rounded-2xl border border-white/10 hover:theme-border-primary transition-all cursor-pointer group active:scale-[0.98]">
                  <div className={`w-2 h-2 rounded-full ${task.color} shrink-0 shadow-sm`}></div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-black text-adaptive-main group-hover:theme-text-primary transition-colors uppercase tracking-tight truncate">{task.label}</h4>
                    <p className="text-[9px] text-adaptive-sub font-black uppercase tracking-widest mt-0.5">{task.time} ago</p>
                  </div>
                  <ChevronRight size={14} className="text-slate-700 group-hover:theme-text-primary transition-transform group-hover:translate-x-0.5" />
                </div>
              ))}
            </div>
            <button
              onClick={() => setIsLogsOpen(true)}
              className="w-full mt-8 py-4 bg-adaptive-nested hover:theme-bg-primary hover:text-white rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] text-adaptive-sub transition-all border border-white/10 active:scale-95 shadow-sm"
            >
              Activity Logs
            </button>
          </div>
        )}
      </div>

      {isLogsOpen && (
        <Suspense fallback={null}>
          <LogsModal
            isOpen={isLogsOpen}
            onClose={() => setIsLogsOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default Dashboard;
