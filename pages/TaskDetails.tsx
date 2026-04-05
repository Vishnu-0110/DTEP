import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, FileText, Download, CheckCircle, Loader2, Target, Sparkles, Zap, AlertTriangle, TrendingUp } from 'lucide-react';
import api from '../services/api';
import { Submission, Task } from '../types';
import { getScoreTone } from '../utils/scoreTone';

const formatDeadlineDateTime = (deadline?: string) => {
  if (!deadline) return 'Dec 12, 2025 11:59 PM';
  const date = new Date(deadline);
  if (!Number.isFinite(date.getTime())) return 'Invalid deadline';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCountdown = (deadline?: string, nowMs?: number) => {
  if (!deadline || nowMs === undefined) return '--';
  const deadlineMs = new Date(deadline).getTime();
  if (!Number.isFinite(deadlineMs)) return 'Unknown';

  const diff = deadlineMs - nowMs;
  if (diff < 0) return 'Overdue';
  const totalSeconds = Math.floor(diff / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const URL_PATTERN = /\bhttps?:\/\/\S+\b/gi;
const TITLE_SOURCE_TAIL_PATTERN = /\s*(?:source|reference|identity source)\s*[:\-]\s*.*$/i;
const sanitizeStudentText = (value = '') => (
  String(value || '').replace(URL_PATTERN, '').trim()
);
const sanitizeStudentTitle = (value = '') => (
  String(value || '')
    .replace(TITLE_SOURCE_TAIL_PATTERN, '')
    .replace(URL_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim()
);

const sanitizeStudentRubricText = (value = '') => (
  String(value || '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*(suggested references?|reference links?|reference link|reference)\s*:/i.test(line))
    .map((line) => String(line || '').replace(URL_PATTERN, '').trimEnd())
    .filter(Boolean)
    .join('\n')
    .trim()
);

const TaskDetails: React.FC = () => {
  const { taskId } = useParams();
  const [task, setTask] = useState<Task | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const verifiedScore = typeof submission?.marks === 'number' ? submission.marks : null;
  const verifiedScoreTone = getScoreTone(verifiedScore);
  const rubricText = sanitizeStudentRubricText((task as any)?.rubricText || '');
  const taskDescription = sanitizeStudentText((task as any)?.description || '');
  const taskTitle = sanitizeStudentTitle((task as any)?.title || '');
  const requiredPages = Math.max(0, Math.trunc(Number((task as any)?.requiredPages || 0)));
  const sectionAnalysis = Array.isArray((submission as any)?.evaluationDetails?.sectionAnalysis)
    ? (submission as any).evaluationDetails.sectionAnalysis
    : [];
  const structureScore = typeof (submission as any)?.evaluationDetails?.structureScore === 'number'
    ? (submission as any).evaluationDetails.structureScore
    : null;

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [taskRes, subsRes] = await Promise.all([
          api.get(`/tasks/${taskId}`),
          api.get('/submissions/my-submissions')
        ]);
        setTask(taskRes.data);
        const mySub = subsRes.data.find((s: any) => (s.task?._id || s.task) === taskId);
        setSubmission(mySub);
      } catch (err) {
        console.error("Failed to load task details", err);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [taskId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleDownload = () => {
    setDownloading(true);
    setTimeout(() => {
      setDownloading(false);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    }, 1500);
  };

  if (isLoading) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="animate-spin theme-text-primary" size={48} />
        <p className="text-adaptive-sub font-black uppercase tracking-widest text-xs animate-pulse">Loading task details...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10">
      <Link to="/student/tasks" className="flex items-center gap-2 text-adaptive-sub hover:theme-text-primary transition-all group w-fit">
        <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Back to Assignments</span>
      </Link>

      <div className="glass-card rounded-[32px] sm:rounded-[48px] p-5 sm:p-10 lg:p-14 border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 hidden sm:block">
            <div className="bg-blue-600/10 text-blue-400 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-blue-500/10">
                Course Task
            </div>
        </div>

        <div className="space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-adaptive-main tracking-tighter leading-tight uppercase">{taskTitle || 'Architecture Deep Dive'}</h1>
            {taskDescription && (
              <p className="text-adaptive-sub text-base sm:text-lg font-medium leading-relaxed max-w-2xl">{taskDescription}</p>
            )}
            {(rubricText || requiredPages > 0) && (
              <div className="mt-4 rounded-3xl border border-blue-500/20 bg-blue-500/10 p-4 sm:p-5">
                <p className="text-[9px] font-black uppercase tracking-widest theme-text-primary">AI Rubric Guidance</p>
                {requiredPages > 0 && (
                  <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-amber-300">
                    Required length: at least {requiredPages} page(s) in PDF.
                  </p>
                )}
                {rubricText && (
                  <p className="mt-2 text-sm text-adaptive-main font-medium leading-relaxed whitespace-pre-line break-words">
                    {rubricText}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 py-8 border-y border-white/5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-adaptive-nested rounded-2xl flex items-center justify-center theme-text-primary border border-white/5 shadow-md">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest">Deadline</p>
                <p className="text-sm font-bold text-adaptive-main">{formatDeadlineDateTime(task?.deadline)}</p>
                <p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${task?.deadline && new Date(task.deadline).getTime() < nowMs ? 'text-rose-500' : 'theme-text-primary'}`}>
                  {formatCountdown(task?.deadline, nowMs)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-adaptive-nested rounded-2xl flex items-center justify-center text-purple-400 border border-white/5 shadow-md">
                <FileText size={20} />
              </div>
              <div>
                <p className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest">File Format</p>
                <p className="text-sm font-bold text-adaptive-main">PDF / DOC / DOCX</p>
              </div>
            </div>
          </div>

          {/* AI Analysis Report Section */}
          {submission?.aiReport && (
            <div className="space-y-6 pt-4 animate-in fade-in duration-700">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl theme-bg-primary flex items-center justify-center text-white shadow-lg theme-shadow-primary">
                    <Sparkles size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xl font-black text-adaptive-main tracking-tight uppercase leading-none">AI Analysis Report</h3>
                    <p className="text-[9px] font-black theme-text-primary uppercase tracking-widest mt-1.5 flex items-center gap-1">
                      <Zap size={10} /> Automated Assessment Generated
                    </p>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <p className={`text-3xl font-black leading-none ${verifiedScoreTone.valueTextClass}`}>{verifiedScore ?? 0}%</p>
                  <p className="text-[8px] font-black text-adaptive-sub uppercase tracking-widest mt-1">Verified Score</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Strengths */}
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-3xl p-6 space-y-4">
                  <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    <CheckCircle size={14} /> Strengths
                  </h4>
                  <ul className="space-y-2">
                    {submission.aiReport.strengths.map((item, idx) => (
                      <li key={idx} className="text-xs font-medium text-adaptive-main leading-relaxed flex gap-2">
                        <span className="text-emerald-500 shrink-0">•</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Weaknesses */}
                <div className="bg-rose-500/5 border border-rose-500/10 rounded-3xl p-6 space-y-4">
                  <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] flex items-center gap-2">
                    <AlertTriangle size={14} /> Needs Improvement
                  </h4>
                  <ul className="space-y-2">
                    {submission.aiReport.weaknesses.map((item, idx) => (
                      <li key={idx} className="text-xs font-medium text-adaptive-main leading-relaxed flex gap-2">
                        <span className="text-rose-500 shrink-0">•</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Improvements */}
                <div className="bg-blue-500/5 border border-blue-500/10 rounded-3xl p-6 space-y-4">
                  <h4 className="text-[10px] font-black theme-text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                    <TrendingUp size={14} /> Suggestions
                  </h4>
                  <ul className="space-y-2">
                    {submission.aiReport.improvements.map((item, idx) => (
                      <li key={idx} className="text-xs font-medium text-adaptive-main leading-relaxed flex gap-2">
                        <span className="theme-text-primary shrink-0">•</span> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {sectionAnalysis.length > 0 && (
                <div className="bg-adaptive-nested/30 border border-white/10 rounded-3xl p-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest">Rubric Evaluation</p>
                    {typeof structureScore === 'number' && (
                      <p className="text-[9px] font-black uppercase tracking-widest theme-text-primary">
                        Structure Score: {structureScore}/100
                      </p>
                    )}
                  </div>
                  <div className="mt-3 space-y-2">
                    {sectionAnalysis.map((item: any, idx: number) => (
                      <div key={`${idx}-${item?.key || 'section'}`} className="rounded-2xl border border-white/10 bg-adaptive-nested px-4 py-3">
                        <p className="text-xs font-black text-adaptive-main">
                          {String(item?.label || 'Section')} • {Number(item?.earnedMarks || 0)}/{Number(item?.maxMarks || 0)}
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-adaptive-sub">
                          Word count: {Number(item?.wordCount || 0)}
                        </p>
                        {item?.issue ? (
                          <p className="mt-1 text-[10px] font-bold text-amber-300 leading-relaxed">{String(item.issue)}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {submission.feedback && (
                <div className="bg-adaptive-nested/30 border border-white/5 rounded-3xl p-6">
                  <p className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest mb-3">Evaluator Feedback</p>
                  <p className="text-sm font-medium text-adaptive-main leading-relaxed italic opacity-80">
                    "{submission.feedback}"
                  </p>
                </div>
              )}
            </div>
          )}

          {!submission?.aiReport && (
            <div className="space-y-5">
              <h3 className="text-lg font-black text-adaptive-main flex items-center gap-3 tracking-tight uppercase">
                  <Target size={20} className="theme-text-primary" />
                  Key Deliverables
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  "Analyze global state management architecture.",
                  "Verify strict memoization implementation.",
                  "Design scalable data-fetching paradigms.",
                  "Final performance audit report (PDF)."
                ].map((obj, i) => (
                  <div key={i} className="flex gap-3 text-adaptive-sub text-sm bg-adaptive-nested/50 p-4 rounded-2xl border border-white/5 group hover:border-blue-500/20 transition-all cursor-default">
                    <div className="mt-0.5 text-blue-500 shrink-0"><CheckCircle size={14} /></div>
                    <span className="leading-snug font-medium">{obj}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-8 flex flex-col sm:flex-row gap-3">
            <button 
                onClick={handleDownload}
                disabled={downloading}
                className={`flex-1 sm:flex-none theme-bg-primary hover:opacity-95 text-white font-black py-4 px-10 rounded-2xl shadow-xl theme-shadow-primary transition-all flex items-center justify-center gap-3 active:scale-95 uppercase tracking-widest text-[10px] ${downloading ? 'opacity-70' : ''}`}
            >
                {downloading ? <Loader2 size={18} className="animate-spin" /> : downloaded ? <CheckCircle size={18} /> : <Download size={18} />}
                {downloading ? 'Preparing...' : downloaded ? 'Ready' : 'Download Resources'}
            </button>
            <Link to="/student/tasks" className="flex-1 sm:flex-none border border-white/10 bg-adaptive-nested/50 hover:bg-adaptive-nested text-adaptive-sub hover:text-adaptive-main font-black py-4 px-10 rounded-2xl transition-all flex items-center justify-center text-[10px] uppercase tracking-widest">
                {submission ? 'View Submission' : 'Submit Solution'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetails;
