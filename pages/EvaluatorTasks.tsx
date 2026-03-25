
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  ClipboardCheck, 
  Loader2,
  AlertCircle,
  Clock,
  Trash2,
  CheckCircle2
} from 'lucide-react';
import api from '../services/api';
import TaskModal from '../components/TaskModal';

const EvaluatorTasks: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const sortTasksByRecent = (items: any[]) => {
    return [...(items || [])].sort((a, b) => {
      const aTime = new Date(a?.createdAt || 0).getTime();
      const bTime = new Date(b?.createdAt || 0).getTime();
      return bTime - aTime;
    });
  };

  const fetchTasks = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await api.get('/tasks');
      setTasks(sortTasksByRecent(response.data || []));
    } catch (err: any) {
      const backendMessage = err.response?.data?.message;
      if (err.response?.status === 401) {
        setError('Session expired or invalid token. Please log in again.');
      } else if (!err.response) {
        setError('Cannot reach backend API. Verify VITE_API_URL or your same-origin /api proxy configuration.');
      } else {
        setError(backendMessage || 'Failed to load tasks from server. Ensure your backend and MongoDB are active.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleCreateTask = async (formData: any) => {
    setError('');
    setSuccess('');
    try {
      await api.post('/tasks', formData);
      
      setIsModalOpen(false);
      setSuccess('Assignment created successfully.');
      fetchTasks();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error creating assignment. Check network connectivity.');
    }
  };

  const handleDeleteTask = async (task: any) => {
    if (!task?._id) return;
    setError('');
    setSuccess('');

    const confirmed = window.confirm(`Delete assignment "${task.title}"? This will also remove all related submissions.`);
    if (!confirmed) return;

    try {
      setDeletingTaskId(task._id);
      await api.delete(`/tasks/${task._id}`);
      setTasks((prev) => prev.filter((t) => t._id !== task._id));
      setSuccess('Assignment deleted successfully.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete assignment.');
    } finally {
      setDeletingTaskId(null);
    }
  };

  return (
    <div className="space-y-6 lg:space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-adaptive-main tracking-tighter uppercase italic">Assignments</h1>
          <p className="text-adaptive-sub font-medium text-sm sm:text-base">Create and manage assignments.</p>
        </div>
        <button 
          onClick={() => { setError(''); setIsModalOpen(true); }}
          className="btn-primary px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 w-full sm:w-auto"
        >
          <Plus size={18} />
          Add Assignment
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-5 rounded-2xl flex items-center gap-3 text-red-500 text-[11px] font-bold animate-in slide-in-from-top-2">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-2xl flex items-center gap-3 text-emerald-500 text-[11px] font-bold animate-in slide-in-from-top-2">
          <CheckCircle2 size={18} />
          {success}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 bg-adaptive-nested/10 rounded-[40px] border border-dashed border-white/10">
          <Loader2 className="animate-spin theme-text-primary" size={40} />
          <p className="text-adaptive-sub font-black uppercase tracking-widest text-[9px] animate-pulse">Loading assignments...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
          {tasks.map((task) => {
            const submittedUnits = Number.isFinite(Number(task?.submissions)) ? Number(task.submissions) : 0;
            const totalUnits = Number.isFinite(Number(task?.total)) ? Number(task.total) : 0;
            const responseRate = totalUnits > 0 ? Math.min(100, (submittedUnits / totalUnits) * 100) : 0;

            return (
            <div key={task._id} className="glass-card rounded-[32px] p-6 sm:p-7 hover:translate-y-[-4px] transition-all border border-white/5 group relative shadow-sm hover:shadow-xl overflow-visible">
              <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                <ClipboardCheck size={80} />
              </div>
              
              <div className="flex justify-between items-start mb-6 relative z-10">
                <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors duration-300 ${
                  task.status === 'completed' ? 'bg-adaptive-nested text-adaptive-sub border-white/5' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10'
                }`}>
                  {task.status || 'active'}
                </div>
                <button
                  onClick={() => handleDeleteTask(task)}
                  disabled={deletingTaskId === task._id}
                  className="text-rose-500 hover:text-rose-400 transition-colors p-2 rounded-xl active:scale-90 bg-rose-500/10 border border-rose-500/15 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label={`Delete task ${task.title}`}
                  title="Delete Task"
                >
                  {deletingTaskId === task._id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              </div>

              <div className="relative z-10">
                <h3 className="text-xl font-black text-adaptive-main mb-1 group-hover:theme-text-primary transition-colors tracking-tight line-clamp-1 uppercase">
                  {task.title}
                </h3>
                <p className="text-[9px] text-adaptive-sub font-black uppercase tracking-widest mb-6 opacity-60">ID: {task._id.slice(-8)}</p>
              </div>
              
              <div className="space-y-6 relative z-10">
                <div className="flex items-center gap-3 text-adaptive-sub text-[10px] font-black uppercase tracking-widest bg-adaptive-nested p-3.5 rounded-2xl border border-white/5">
                  <Clock size={14} className="theme-text-primary" />
                  <span>Due {new Date(task.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                {Number(task?.requiredPages || 0) > 0 && (
                  <div className="flex items-center gap-3 text-amber-300 text-[10px] font-black uppercase tracking-widest bg-amber-500/10 p-3.5 rounded-2xl border border-amber-500/20">
                    <ClipboardCheck size={14} />
                    <span>Required Pages: {Number(task.requiredPages)}</span>
                  </div>
                )}
                
                <div className="space-y-3">
                  <div className="flex justify-between text-[9px] font-black text-adaptive-sub uppercase tracking-widest px-1">
                    <span>Response Rate</span>
                    <span className="text-adaptive-main font-bold">{submittedUnits} / {totalUnits} Units</span>
                  </div>
                  <div className="h-1.5 w-full bg-adaptive-nested rounded-full overflow-hidden border border-white/5 p-[1px]">
                    <div 
                      className="h-full theme-bg-primary rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(var(--primary),0.5)]" 
                      style={{ width: `${responseRate}%` }}
                    />
                  </div>
                </div>
              </div>

              <Link 
                to={`/evaluator/submissions/${task._id}`}
                className="mt-8 w-full btn-secondary hover:theme-bg-primary hover:text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-all group/btn shadow-sm active:scale-95 text-[9px] uppercase tracking-[0.2em] relative z-10"
              >
                <ClipboardCheck size={18} className="theme-text-primary group-hover/btn:text-white transition-colors" />
                Review Submissions
              </Link>
            </div>
            );
          })}
          
          {tasks.length === 0 && (
            <div className="col-span-full py-24 text-center glass-card rounded-[40px] border-dashed border-white/10 border-2 flex flex-col items-center justify-center gap-6">
              <div className="w-20 h-20 bg-adaptive-nested rounded-3xl flex items-center justify-center text-adaptive-sub border border-white/5 opacity-40">
                <ClipboardCheck size={40} />
              </div>
              <div className="space-y-2">
                <p className="text-adaptive-main font-black uppercase tracking-widest text-sm">No assignments yet</p>
                <p className="text-adaptive-sub text-[10px] font-bold uppercase tracking-widest opacity-60 max-w-xs mx-auto leading-relaxed">Click 'Add Assignment' to create your first assignment.</p>
              </div>
            </div>
          )}
        </div>
      )}

      <TaskModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSubmit={handleCreateTask} 
      />
    </div>
  );
};

export default EvaluatorTasks;
