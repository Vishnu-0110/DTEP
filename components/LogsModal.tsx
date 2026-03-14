
import React from 'react';
import { X, Terminal, ShieldCheck, Activity, AlertCircle, Database, Cpu, Globe } from 'lucide-react';
import ModalShell from './ModalShell';

interface LogEntry {
  id: string;
  timestamp: string;
  event: string;
  category: 'AUTH' | 'SYSTEM' | 'TASK' | 'API';
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  details: string;
}

interface LogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LogsModal: React.FC<LogsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const logs: LogEntry[] = [
    { id: 'LOG-8821', timestamp: '2025-11-17T14:22:01Z', event: 'USER_LOGIN_SUCCESS', category: 'AUTH', level: 'SUCCESS', details: 'Session established for user: evaluator@dtep.com via OAuth2' },
    { id: 'LOG-8820', timestamp: '2025-11-17T14:15:45Z', event: 'TASK_EVALUATION_LOCKED', category: 'TASK', level: 'INFO', details: 'Evaluation ID 772-B cryptographically sealed by Evaluator-01' },
    { id: 'LOG-8819', timestamp: '2025-11-17T14:10:12Z', event: 'API_GATEWAY_HEALTH', category: 'API', level: 'SUCCESS', details: 'Edge nodes reporting 100% availability across 12 regions' },
    { id: 'LOG-8818', timestamp: '2025-11-17T13:55:30Z', event: 'DB_AUTO_BACKUP', category: 'SYSTEM', level: 'INFO', details: 'Automated snapshot of Production-Cluster-A completed (4.2GB)' },
    { id: 'LOG-8817', timestamp: '2025-11-17T13:42:19Z', event: 'AUTH_RATE_LIMIT', category: 'AUTH', level: 'WARNING', details: 'Suspicious login attempt blocked from IP: 192.168.1.104' },
    { id: 'LOG-8816', timestamp: '2025-11-17T13:30:00Z', event: 'SYS_CPU_SPIKE', category: 'SYSTEM', level: 'WARNING', details: 'Core usage exceeded 85% during AI batch processing' },
    { id: 'LOG-8815', timestamp: '2025-11-17T13:25:12Z', event: 'WEBSOCKET_OPEN', category: 'API', level: 'SUCCESS', details: 'Real-time sync socket opened for user: student@dtep.com' },
    { id: 'LOG-8814', timestamp: '2025-11-17T13:10:05Z', event: 'STORAGE_QUOTA_ALERT', category: 'SYSTEM', level: 'ERROR', details: 'Upload bucket "submissions-main" reached 92% capacity' },
  ];

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'SUCCESS': return 'text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'WARNING': return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20';
      case 'ERROR': return 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20';
      default: return 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20';
    }
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case 'AUTH': return <ShieldCheck size={14} />;
      case 'SYSTEM': return <Cpu size={14} />;
      case 'API': return <Globe size={14} />;
      default: return <Database size={14} />;
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      zIndexClassName="z-[100]"
      viewportClassName="p-3 pt-4 pb-4 sm:p-6 lg:p-10"
      overlayClassName="modal-overlay animate-in fade-in duration-300"
    >
      <div className="modal-surface w-full max-w-5xl max-h-[calc(100dvh-2rem)] sm:max-h-[92vh] rounded-[28px] sm:rounded-[40px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
          <div className="p-4 sm:p-8 border-b border-white/5 flex items-start justify-between gap-4 shrink-0 bg-adaptive-nested">
            <div className="flex items-center gap-3 sm:gap-5 min-w-0">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-black/5 dark:bg-slate-900 border border-white/10 flex items-center justify-center theme-text-primary shadow-xl shrink-0">
                <Terminal size={28} />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-black text-adaptive-main tracking-tighter uppercase leading-none">Activity Logs</h2>
                <p className="text-adaptive-sub text-[10px] font-black uppercase tracking-[0.2em] mt-2">System events and activity</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-adaptive-sub hover:text-adaptive-main rounded-2xl transition-all active:scale-95 border border-white/10"
            >
              <X size={24} />
            </button>
          </div>

          {/* Stats Row */}
          <div className="px-4 sm:px-8 py-4 sm:py-5 border-b border-white/5 bg-adaptive-nested/50 flex flex-wrap gap-3 sm:gap-6 shrink-0">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-adaptive-sub">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              System Health: Good
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-adaptive-sub">
              <Activity size={12} className="theme-text-primary" />
              Events: {logs.length}
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-adaptive-sub">
              <ShieldCheck size={12} className="text-purple-500 dark:text-purple-400" />
              Uptime: 99.98%
            </div>
          </div>

          {/* Log Stream */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-8 space-y-4">
            {logs.map((log) => (
              <div 
                key={log.id} 
                className="glass-card bg-adaptive-nested p-4 sm:p-5 rounded-3xl border border-white/5 hover:theme-border-primary transition-all flex flex-col md:flex-row md:items-center gap-4 group shadow-sm hover:shadow-md"
              >
                <div className="flex items-center gap-4 shrink-0">
                  <span className="font-mono text-[10px] font-black text-adaptive-sub group-hover:theme-text-primary transition-colors uppercase">
                    {log.id}
                  </span>
                  <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${getLevelColor(log.level)}`}>
                    {log.level}
                  </span>
                </div>
                
                <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1 bg-black/5 dark:bg-white/5 rounded-xl border border-white/5">
                    <span className="theme-text-primary">{getCategoryIcon(log.category)}</span>
                    <span className="text-[9px] font-black text-adaptive-sub uppercase tracking-tighter">{log.category}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-adaptive-main leading-tight">{log.event}</p>
                    <p className="text-[11px] text-adaptive-sub font-medium mt-0.5 line-clamp-1 group-hover:line-clamp-none transition-all duration-300">
                      {log.details}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-left md:text-right">
                  <p className="font-mono text-[10px] font-black text-adaptive-sub uppercase">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </p>
                  <p className="text-[8px] font-black text-adaptive-sub opacity-50 uppercase tracking-widest mt-0.5">
                    {new Date(log.timestamp).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="p-4 sm:p-6 bg-adaptive-nested border-t border-white/5 flex flex-col sm:flex-row justify-between items-center shrink-0 gap-4">
            <p className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest italic opacity-60 text-center sm:text-left">
              End of logs. Stored for 90 days.
            </p>
            <button 
              className="text-[10px] font-black theme-text-primary uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all"
              onClick={() => window.print()}
            >
              Export Logs
            </button>
          </div>
      </div>
    </ModalShell>
  );
};

export default LogsModal;
