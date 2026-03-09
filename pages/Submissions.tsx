import React, { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { 
  FileText, 
  Star, 
  CheckCircle,
  Loader2,
  AlertCircle,
  Search,
  Lock,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  Target
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getScoreTone } from '../utils/scoreTone';

const clampMarks = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const Submissions: React.FC = () => {
  const { taskId } = useParams();
  const location = useLocation();
  const { isDemoMode } = useAuth();
  const [task, setTask] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSubmission, setActiveSubmission] = useState<any>(null);
  const [isAILoading, setIsAILoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [marks, setMarks] = useState<number>(0);
  const [marksInput, setMarksInput] = useState('0');
  const [feedback, setFeedback] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<{strengths: string[], weaknesses: string[], improvements: string[]} | null>(null);
  const [aiError, setAiError] = useState('');
  const [pendingSelectionId, setPendingSelectionId] = useState('');

  const locationState = location.state as { activeSubmissionId?: string } | null;

  const appendMissingPoints = (feedbackText = '', missingPoints = '') => {
    const cleanFeedback = String(feedbackText || '').trim();
    const cleanMissing = String(missingPoints || '').trim();

    if (!cleanMissing) return cleanFeedback;
    if (cleanFeedback.toLowerCase().includes(cleanMissing.toLowerCase())) return cleanFeedback;

    return cleanFeedback
      ? `${cleanFeedback}\n\nMissing Points: ${cleanMissing}`
      : `Missing Points: ${cleanMissing}`;
  };

  const applyMarksInput = (rawValue: string) => {
    const digitsOnly = String(rawValue || '').replace(/[^\d]/g, '');
    if (!digitsOnly) {
      setMarksInput('');
      setMarks(0);
      return;
    }

    const normalizedValue = clampMarks(Number(digitsOnly));
    setMarks(normalizedValue);
    setMarksInput(String(normalizedValue));
  };

  const normalizeAiReport = (report: any) => ({
    strengths: Array.isArray(report?.strengths) ? report.strengths : [],
    weaknesses: Array.isArray(report?.weaknesses) ? report.weaknesses : [],
    improvements: Array.isArray(report?.improvements) ? report.improvements : [],
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [taskRes, submissionsRes] = await Promise.all([
        api.get(`/tasks/${taskId}`),
        api.get(`/submissions/task/${taskId}`)
      ]);
      setTask(taskRes.data);
      setSubmissions(submissionsRes.data);
    } catch (err) {
      if (isDemoMode) {
        setTask({
          title: 'Advanced React Architecture',
          description: 'Analyze state management patterns (Redux vs Context). Implement strict memoization with React.memo. Design scalable custom hooks for data fetching. Complete a 5-page performance audit report.'
        });
        setSubmissions([
          { _id: 's1', student: { name: 'Jane Smith' }, submittedAt: '2025-11-15 14:30', status: 'pending', fileName: 'hooks_lab_jsmith.pdf', fileUrl: 'uploads/mock.pdf' },
          { _id: 's2', student: { name: 'Mike Ross' }, submittedAt: '2025-11-16 09:12', status: 'evaluated', fileName: 'mike_hooks_final.doc', fileUrl: 'uploads/mock.doc', marks: 95, feedback: 'Excellent work on the custom hooks implementation.', aiReport: { strengths: ['Deep understanding of state'], weaknesses: ['None'], improvements: ['Optimise re-renders'] } },
          { _id: 's3', student: { name: 'Harvey Specter' }, submittedAt: '2025-11-15 22:45', status: 'pending', fileName: 'react_assignment.pdf', fileUrl: 'uploads/mock.pdf' },
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [taskId]);

  useEffect(() => {
    setPendingSelectionId(String(locationState?.activeSubmissionId || ''));
  }, [locationState?.activeSubmissionId]);

  useEffect(() => {
    if (!pendingSelectionId || submissions.length === 0) return;

    const matchedSubmission = submissions.find((submission) => String(submission._id) === pendingSelectionId);
    if (!matchedSubmission) return;

    setActiveSubmission(matchedSubmission);
    setPendingSelectionId('');
  }, [pendingSelectionId, submissions]);

  useEffect(() => {
    if (activeSubmission) {
      const initialMarks =
        typeof activeSubmission.marks === 'number'
          ? activeSubmission.marks
          : (typeof activeSubmission.aiMarks === 'number' ? activeSubmission.aiMarks : 0);
      const baseFeedback =
        activeSubmission.feedback ||
        activeSubmission.remarks ||
        activeSubmission.aiFeedback ||
        '';
      const initialFeedback = appendMissingPoints(baseFeedback, activeSubmission.missingPoints);
      const normalizedInitialMarks = clampMarks(initialMarks);

      setMarks(normalizedInitialMarks);
      setMarksInput(String(normalizedInitialMarks));
      setFeedback(initialFeedback);
      setAiAnalysis(activeSubmission.aiReport || null);
    }
  }, [activeSubmission]);

  const handleCompleteEvaluation = async () => {
    if (!activeSubmission || activeSubmission.status === 'evaluated') return;
    setIsSubmitting(true);
    try {
      const finalFeedback = appendMissingPoints(feedback, activeSubmission.missingPoints);
      await api.put(`/submissions/${activeSubmission._id}/evaluate`, {
        marks,
        feedback: finalFeedback,
        aiReport: aiAnalysis
      });
      
      setSubmissions(prev => prev.map(s => 
        s._id === activeSubmission._id 
          ? { ...s, marks, feedback: finalFeedback, aiReport: aiAnalysis, status: 'evaluated' } 
          : s
      ));
      
      setFeedback(finalFeedback);
      setActiveSubmission(prev => ({ ...prev, marks, feedback: finalFeedback, aiReport: aiAnalysis, status: 'evaluated' }));
      alert('Evaluation finalized and student notified.');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update evaluation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAIEvaluation = async () => {
    if (!activeSubmission || activeSubmission.status === 'evaluated') return;
    if (activeSubmission.isAutoZero) return;
    setIsAILoading(true);
    setAiError('');
    
    try {
      const res = await api.post(`/submissions/${activeSubmission._id}/ai-assist`);
      const serverSubmission = res.data?.submission || {};
      const scoreValue =
        typeof serverSubmission.aiMarks === 'number'
          ? serverSubmission.aiMarks
          : (typeof res.data?.aiDraft?.score === 'number' ? res.data.aiDraft.score : null);
      const report = normalizeAiReport(serverSubmission.aiReport || res.data?.aiDraft || {});
      const nextFeedback = appendMissingPoints(
        serverSubmission.aiFeedback || res.data?.aiDraft?.summary || 'AI evaluation summary unavailable.',
        serverSubmission.missingPoints || activeSubmission.missingPoints || ''
      );

      if (typeof scoreValue === 'number') {
        const normalizedScore = clampMarks(scoreValue);
        setMarks(normalizedScore);
        setMarksInput(String(normalizedScore));
      }

      setFeedback(nextFeedback);
      setAiAnalysis(report);

      setSubmissions(prev =>
        prev.map(sub =>
          sub._id === activeSubmission._id
            ? {
                ...sub,
                ...serverSubmission,
                aiReport: report,
                aiFeedback: serverSubmission.aiFeedback || res.data?.aiDraft?.summary || sub.aiFeedback || '',
              }
            : sub
        )
      );

      setActiveSubmission(prev =>
        prev
          ? {
              ...prev,
              ...serverSubmission,
              aiReport: report,
              aiFeedback: serverSubmission.aiFeedback || res.data?.aiDraft?.summary || prev.aiFeedback || '',
              feedback: nextFeedback,
            }
          : prev
      );

    } catch (err: any) {
      console.error(err);
      setAiError(err?.response?.data?.message || err?.message || 'AI evaluation failed.');
      setFeedback("AI Evaluation Error. Manual grading required.");
    } finally {
      setIsAILoading(false);
    }
  };

  const handleViewSubmission = async () => {
    if (!activeSubmission?._id || isViewing) return;
    if (activeSubmission.isAutoZero) {
      alert(activeSubmission.feedback || 'No file is available. This assignment was auto-marked 0 because it was not submitted before the deadline.');
      return;
    }

    setIsViewing(true);
    try {
      const response = await api.get(`/submissions/${activeSubmission._id}/view`, {
        responseType: 'blob'
      });

      const objectUrl = window.URL.createObjectURL(response.data);
      const openedWindow = window.open(objectUrl, '_blank', 'noopener,noreferrer');

      if (!openedWindow) {
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }

      window.setTimeout(() => {
        window.URL.revokeObjectURL(objectUrl);
      }, 60000);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to open document.');
    } finally {
      setIsViewing(false);
    }
  };

  const isEvaluated = activeSubmission?.status === 'evaluated';
  const isMissedSubmission = Boolean(activeSubmission?.isAutoZero);
  const currentScoreTone = getScoreTone(marks);

  return (
    <div className="space-y-6 lg:space-y-10 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] font-black theme-text-primary uppercase tracking-[0.4em]">Batch ID: {taskId?.slice(-6)}</p>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-adaptive-main tracking-tighter uppercase leading-none">
            {task?.title || 'Review Vault'}
          </h1>
          <p className="text-adaptive-sub text-sm font-medium">Verify methodology and authorize performance metrics.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 bg-adaptive-nested/50 p-2 rounded-2xl border border-white/5 w-full min-[420px]:w-fit">
             <div className="px-4 py-2 rounded-xl bg-app border border-white/5 text-center min-w-0">
                <p className="text-[8px] font-black text-adaptive-sub uppercase tracking-widest leading-none">Total</p>
                <p className="text-lg font-black text-adaptive-main leading-none mt-1.5">{submissions.length}</p>
             </div>
             <div className="px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/10 text-center min-w-0">
                <p className="text-[8px] font-black theme-text-primary uppercase tracking-widest leading-none">Pending</p>
                <p className="text-lg font-black theme-text-primary leading-none mt-1.5">{submissions.filter(s => s.status !== 'evaluated').length}</p>
             </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-10 items-start">
        {/* Submissions List */}
        <div className="xl:col-span-2 space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 bg-adaptive-nested/20 rounded-[32px] border border-dashed border-white/10">
              <Loader2 className="animate-spin theme-text-primary" size={40} />
              <p className="text-adaptive-sub font-black uppercase tracking-widest text-[9px] animate-pulse">Scanning Archive</p>
            </div>
          ) : submissions.length === 0 ? (
            <div className="glass-card p-10 sm:p-20 rounded-[32px] text-center border-dashed border-white/10 flex flex-col items-center justify-center gap-4">
              <Search size={32} className="opacity-10" />
              <p className="text-adaptive-sub font-bold text-xs uppercase tracking-widest">No transmissions detected.</p>
            </div>
          ) : (
            submissions.map((sub) => {
              const displayMarks = typeof sub.marks === 'number'
                ? sub.marks
                : (typeof sub.aiMarks === 'number' ? sub.aiMarks : null);
              const isAiOnlyMarks = typeof sub.marks !== 'number' && typeof sub.aiMarks === 'number';
              const scoreTone = getScoreTone(displayMarks);
              return (
              <div 
                key={sub._id} 
                onClick={() => setActiveSubmission(sub)}
                className={`glass-card p-5 sm:p-7 rounded-3xl cursor-pointer transition-all duration-300 border group ${
                  activeSubmission?._id === sub._id 
                    ? 'theme-border-primary ring-4 ring-blue-500/10' 
                    : 'border-white/5 hover:border-white/20 hover:bg-adaptive-nested'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex w-full min-w-0 items-center gap-4 sm:gap-5">
                    <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center border transition-all shadow-md shrink-0 ${
                      sub.isAutoZero
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/10'
                        : (sub.status === 'evaluated' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10' : 'bg-adaptive-nested theme-text-primary border-white/5')
                    }`}>
                      <FileText size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-black text-adaptive-main group-hover:theme-text-primary transition-colors tracking-tight truncate">{sub.student?.name}</h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-[9px] text-adaptive-sub uppercase font-black tracking-widest shrink-0">{new Date(sub.submittedAt).toLocaleDateString()}</span>
                          <span className="hidden min-[420px]:block w-1 h-1 bg-slate-700 rounded-full shrink-0"></span>
                          <span className="text-[9px] text-adaptive-sub uppercase font-black tracking-widest break-all">{sub.fileName}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 border-white/5 pt-4 sm:pt-0">
                    {displayMarks !== null && (
                      <div className="text-right">
                        <div className={`text-2xl font-black ${scoreTone.valueTextClass}`}>{displayMarks}</div>
                        <div className={`text-[7px] font-black uppercase tracking-[0.2em] leading-none mt-1 ${displayMarks !== null ? scoreTone.labelTextClass : 'text-adaptive-sub'}`}>{isAiOnlyMarks ? 'AI' : 'Grade'}</div>
                      </div>
                    )}
                    <div className={`px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest flex items-center gap-2 border transition-colors ${
                      sub.isAutoZero
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/10'
                        : (sub.status === 'evaluated' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10' : 'bg-blue-500/10 text-blue-400 border-blue-500/10')
                    }`}>
                      {sub.status === 'evaluated' || sub.isAutoZero ? <CheckCircle size={10} /> : <div className="w-1.5 h-1.5 rounded-full theme-bg-primary animate-pulse"></div>}
                      {sub.isAutoZero ? 'missed' : sub.status}
                    </div>
                    <ArrowRight size={18} className={`text-slate-700 transition-all hidden sm:block ${activeSubmission?._id === sub._id ? 'translate-x-1 theme-text-primary' : 'group-hover:translate-x-1 group-hover:text-slate-400'}`} />
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>

        {/* Evaluation Panel */}
        <div className="xl:col-span-1 xl:sticky xl:top-24">
          {activeSubmission ? (
            <div className="glass-card p-5 sm:p-10 rounded-[32px] sm:rounded-[40px] shadow-2xl animate-in slide-in-from-right-8 duration-500 border border-white/10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-8">
                <div className="space-y-1">
                  <p className="text-[9px] font-black theme-text-primary uppercase tracking-widest">Active Focus</p>
                  <h2 className="text-2xl font-black text-adaptive-main tracking-tighter uppercase leading-none">
                    Terminal
                  </h2>
                </div>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-lg ${isEvaluated ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10' : 'bg-adaptive-nested text-adaptive-sub border-white/5'}`}>
                  {isEvaluated ? <Lock size={20} /> : <Star size={20} />}
                </div>
              </div>
              
              <div className="space-y-8">
                <div className="p-4 bg-adaptive-nested/50 rounded-2xl border border-white/5 flex items-start gap-3">
                  <Target size={14} className="theme-text-primary mt-1 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[8px] font-black text-adaptive-sub uppercase tracking-widest mb-0.5">Reference Task</p>
                    <p className="text-xs font-bold text-adaptive-main break-words">{task?.title || "Evaluating Component"}</p>
                  </div>
                </div>

                <button 
                  type="button"
                  onClick={handleViewSubmission}
                  disabled={isViewing || isMissedSubmission}
                  className={`w-full p-4 bg-adaptive-nested rounded-2xl border border-white/5 flex items-center justify-between gap-4 group transition-all shadow-sm text-left ${isMissedSubmission ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:theme-border-primary'}`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-app flex items-center justify-center theme-text-primary border border-white/5 group-hover:scale-105 transition-transform">
                        <FileText size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[8px] font-black text-adaptive-sub uppercase tracking-widest mb-0.5">Document</p>
                        <span className="text-xs font-bold text-adaptive-main truncate block">{activeSubmission.fileName}</span>
                    </div>
                  </div>
                  <div className="shrink-0 rounded-xl bg-blue-500/10 px-3 py-2 text-[8px] font-black uppercase tracking-widest theme-text-primary text-center min-w-[72px]">
                    {isMissedSubmission ? 'No File' : (isViewing ? 'Opening' : 'View')}
                  </div>
                </button>

                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest">Grade (0-100)</label>
                    <span className="text-[8px] font-black theme-text-primary uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded">Numeric Input</span>
                  </div>
                  <input 
                    type="number" 
                    value={marksInput}
                    onChange={(e) => applyMarksInput(e.target.value)}
                    onBlur={() => {
                      if (!marksInput) {
                        setMarks(0);
                        setMarksInput('0');
                      }
                    }}
                    max={100} min={0}
                    disabled={isEvaluated || isSubmitting}
                    className={`w-full bg-adaptive-nested border-2 rounded-2xl py-5 px-6 text-3xl sm:text-4xl font-black text-center focus:outline-none focus:theme-border-primary transition-all ${currentScoreTone.borderClass} ${currentScoreTone.valueTextClass} ${isEvaluated ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
                    <label className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest">Feedback & Analysis</label>
                    {!isEvaluated && !isMissedSubmission && (
                      <button 
                        onClick={getAIEvaluation}
                        disabled={isAILoading || isEvaluated}
                        className="text-[8px] flex items-center gap-2 font-black theme-text-primary hover:text-white transition-all uppercase tracking-widest bg-blue-500/10 hover:theme-bg-primary px-3 py-2 rounded-lg active:scale-95 disabled:opacity-50 shadow-sm"
                      >
                        {isAILoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {isAILoading ? 'Processing AI...' : 'AI Assist'}
                      </button>
                    )}
                  </div>
                  
                  <div className="relative">
                    <textarea 
                      rows={6}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      disabled={isEvaluated || isSubmitting}
                      placeholder="Technical commentary and rubric feedback..."
                      className={`w-full bg-adaptive-nested border-2 border-white/5 rounded-3xl py-4 px-5 text-sm text-adaptive-main focus:outline-none focus:theme-border-primary transition-all custom-scrollbar resize-none leading-relaxed ${isEvaluated ? 'opacity-50 cursor-not-allowed border-emerald-500/20' : ''}`}
                    ></textarea>
                  </div>
                  {aiError && (
                    <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl flex items-start gap-2 text-red-500 text-[10px] font-bold">
                      <AlertCircle size={14} className="mt-0.5 shrink-0" />
                      <span>{aiError}</span>
                    </div>
                  )}
                  {isMissedSubmission && (
                    <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-rose-400 text-[10px] font-bold">
                      Deadline missed. The system assigned 0 marks automatically because no submission was uploaded.
                    </div>
                  )}
                  {activeSubmission?.missingPoints && (
                    <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-amber-400 text-[10px] font-bold">
                      Missing Points: {activeSubmission.missingPoints}
                    </div>
                  )}
                </div>

                {isEvaluated ? (
                  <div className="w-full bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 font-black uppercase tracking-[0.2em] py-5 rounded-2xl flex items-center justify-center gap-2.5 shadow-sm text-[10px]">
                    <ShieldCheck size={20} />
                    Evaluation Sealed
                  </div>
                ) : (
                  <button 
                    onClick={handleCompleteEvaluation}
                    disabled={isSubmitting || isEvaluated}
                    className={`w-full theme-bg-primary hover:opacity-95 text-white font-black uppercase tracking-[0.2em] py-5 rounded-2xl shadow-xl theme-shadow-primary flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] text-[10px] ${isSubmitting ? 'opacity-70' : ''}`}
                  >
                    {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                    Finalize Record
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-card p-8 sm:p-16 rounded-[32px] sm:rounded-[40px] flex flex-col items-center justify-center text-center xl:sticky xl:top-24 border-dashed border-white/10 border-2">
              <div className="w-20 h-20 bg-adaptive-nested/50 rounded-3xl flex items-center justify-center text-adaptive-sub mb-6 border border-white/5 shadow-inner">
                <Target size={32} className="opacity-10" />
              </div>
              <h3 className="text-lg font-black text-adaptive-sub tracking-tight uppercase">Ready for Analysis</h3>
              <p className="text-[10px] text-adaptive-sub mt-2 max-w-[180px] leading-relaxed font-bold uppercase tracking-widest opacity-40">Select a submission from the directory to begin the evaluation session.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Submissions;
