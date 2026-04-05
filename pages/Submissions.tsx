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
const AI_ASSIST_TIMEOUT_MS = 180000;

const escapeHtml = (value: string) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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
  const [isReopening, setIsReopening] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [marks, setMarks] = useState<number>(0);
  const [marksInput, setMarksInput] = useState('0');
  const [feedback, setFeedback] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState<{strengths: string[], weaknesses: string[], improvements: string[]} | null>(null);
  const [aiError, setAiError] = useState('');
  const [pendingSelectionId, setPendingSelectionId] = useState('');
  const [reopenReasonInput, setReopenReasonInput] = useState('');

  const locationState = location.state as { activeSubmissionId?: string } | null;

  const normalizeMissingPoint = (value = '') => (
    String(value || '')
      .replace(/^missing points?\s*:\s*/i, '')
      .replace(/^[-*•]+\s*/, '')
      .trim()
  );
  const splitMissingPoints = (value = '') => (
    String(value || '')
      .split(/[;\n\r]+/)
      .map(normalizeMissingPoint)
      .filter(Boolean)
  );
  const dedupeMissingPoints = (items: string[] = []) => {
    const seen = new Set<string>();
    const output: string[] = [];

    for (const item of items) {
      for (const point of splitMissingPoints(item)) {
        const key = point.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(point);
      }
    }

    return output;
  };

  const appendMissingPoints = (feedbackText = '', missingPoints = '') => {
    const cleanFeedback = String(feedbackText || '').trim();
    const missingList = dedupeMissingPoints([missingPoints]);

    if (missingList.length === 0) return cleanFeedback;

    const existingInFeedback = dedupeMissingPoints([cleanFeedback]).map((point) => point.toLowerCase());
    const nextMissingList = missingList.filter((point) => !existingInFeedback.includes(point.toLowerCase()));

    if (nextMissingList.length === 0) return cleanFeedback;
    const formattedMissing = nextMissingList.join('; ');

    return cleanFeedback
      ? `${cleanFeedback}\n\nMissing Points: ${formattedMissing}`
      : `Missing Points: ${formattedMissing}`;
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

  const extractErrorMessage = async (error: any) => {
    const blobData = error?.response?.data;
    if (blobData instanceof Blob) {
      try {
        const rawText = await blobData.text();
        if (!rawText) return 'Failed to open document.';
        try {
          const parsed = JSON.parse(rawText);
          if (typeof parsed?.message === 'string' && parsed.message.trim()) {
            return parsed.message.trim();
          }
        } catch (_) {
          // Not JSON; keep the raw fallback below.
        }
        return rawText.trim();
      } catch (_) {
        // Fall back below.
      }
    }

    const responseMessage = error?.response?.data?.message;
    if (typeof responseMessage === 'string' && responseMessage.trim()) {
      return responseMessage.trim();
    }

    const errMessage = error?.message;
    if (typeof errMessage === 'string' && errMessage.trim()) {
      return errMessage.trim();
    }

    return 'Failed to open document.';
  };

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
      setReopenReasonInput(String(activeSubmission.reopenReason || '').trim());
    }
  }, [activeSubmission]);

  const handleReopenSubmission = async () => {
    if (!activeSubmission?._id || isMissedSubmission || isReopening) return;

    setIsReopening(true);
    try {
      const response = await api.put(`/submissions/${activeSubmission._id}/reopen`, {
        reason: String(reopenReasonInput || '').trim(),
      });
      const updatedSubmission = response.data?.submission || {};

      setSubmissions((prev) =>
        prev.map((sub) =>
          sub._id === activeSubmission._id
            ? { ...sub, ...updatedSubmission }
            : sub
        )
      );
      setActiveSubmission((prev) => (prev ? { ...prev, ...updatedSubmission } : prev));
      setReopenReasonInput(String(updatedSubmission.reopenReason || reopenReasonInput || '').trim());
      alert(response.data?.message || 'Resubmission window opened for this student.');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to reopen submission.');
    } finally {
      setIsReopening(false);
    }
  };

  const handleCompleteEvaluation = async () => {
    if (!activeSubmission || activeSubmission.status === 'evaluated') return;
    setIsSubmitting(true);
    try {
      const finalFeedback = appendMissingPoints(feedback, activeSubmission.missingPoints);
      const response = await api.put(`/submissions/${activeSubmission._id}/evaluate`, {
        marks,
        feedback: finalFeedback,
        aiReport: aiAnalysis
      });
      const serverSubmission = response.data || {};
      const persistedMarks = typeof serverSubmission.marks === 'number'
        ? clampMarks(serverSubmission.marks)
        : marks;
      const persistedReport = normalizeAiReport(serverSubmission.aiReport || aiAnalysis || {});
      const persistedFeedback = appendMissingPoints(
        serverSubmission.feedback || serverSubmission.remarks || finalFeedback,
        serverSubmission.missingPoints || activeSubmission.missingPoints || ''
      );
      
      setSubmissions(prev => prev.map(s => 
        s._id === activeSubmission._id 
          ? {
              ...s,
              ...serverSubmission,
              marks: persistedMarks,
              feedback: persistedFeedback,
              aiReport: persistedReport,
              status: 'evaluated'
            } 
          : s
      ));
      
      setMarks(persistedMarks);
      setMarksInput(String(persistedMarks));
      setFeedback(persistedFeedback);
      setAiAnalysis(persistedReport);
      setActiveSubmission(prev => (
        prev
          ? {
              ...prev,
              ...serverSubmission,
              marks: persistedMarks,
              feedback: persistedFeedback,
              aiReport: persistedReport,
              status: 'evaluated'
            }
          : prev
      ));
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
      const res = await api.post(
        `/submissions/${activeSubmission._id}/ai-assist`,
        {},
        { timeout: AI_ASSIST_TIMEOUT_MS }
      );
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
      const errorCode = String(err?.code || '').trim().toUpperCase();
      const timedOut = errorCode === 'ECONNABORTED';
      const serverMessage = timedOut
        ? 'AI evaluation is taking longer than expected. Please try again in a moment.'
        : (err?.response?.data?.message || err?.message || 'AI evaluation failed.');
      setAiError(serverMessage);
      setFeedback(serverMessage);
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
    const previewWindow = window.open('', '_blank');
    if (previewWindow && !previewWindow.closed) {
      previewWindow.document.write(`
        <html>
          <head>
            <title>Loading Submission Preview</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
              .card { background: #111827; border: 1px solid #334155; border-radius: 16px; padding: 20px 24px; max-width: 560px; }
              h1 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.12em; margin: 0 0 8px 0; color: #93c5fd; }
              p { margin: 0; font-size: 14px; line-height: 1.5; color: #cbd5e1; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Loading Submission</h1>
              <p>Please wait while we open the student document in this temporary preview tab.</p>
            </div>
          </body>
        </html>
      `);
      previewWindow.document.close();
    }

    try {
      const response = await api.get(`/submissions/${activeSubmission._id}/view`, {
        responseType: 'blob'
      });

      const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
      const contentDisposition = String(response.headers?.['content-disposition'] || '');
      const fileNameFromHeaderMatch = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i);
      const fileNameFromHeader = fileNameFromHeaderMatch?.[1]
        ? decodeURIComponent(fileNameFromHeaderMatch[1]).replace(/^"+|"+$/g, '').trim()
        : '';
      const fallbackFileName = String(
        fileNameFromHeader || activeSubmission.fileName || `submission-${activeSubmission._id}`
      ).trim();
      const isPdf = contentType.includes('application/pdf') || fallbackFileName.toLowerCase().endsWith('.pdf');

      const objectUrl = window.URL.createObjectURL(response.data);
      if (previewWindow && !previewWindow.closed) {
        if (isPdf) {
          previewWindow.location.href = objectUrl;
        } else {
          const safeFileName = escapeHtml(fallbackFileName);
          previewWindow.document.write(`
            <html>
              <head>
                <title>Submission Preview</title>
                <style>
                  body { margin: 0; font-family: Arial, sans-serif; background: #0f172a; color: #e2e8f0; }
                  .header { padding: 14px 16px; border-bottom: 1px solid #334155; background: #111827; display: flex; gap: 12px; align-items: center; justify-content: space-between; }
                  .title { font-size: 13px; font-weight: 700; letter-spacing: 0.03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                  .download { border: 1px solid #3b82f6; color: #bfdbfe; text-decoration: none; border-radius: 10px; padding: 8px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; }
                  .hint { padding: 12px 16px; font-size: 12px; color: #cbd5e1; }
                  iframe { width: 100%; height: calc(100vh - 88px); border: 0; background: #0b1120; }
                </style>
              </head>
              <body>
                <div class="header">
                  <div class="title">${safeFileName}</div>
                  <a class="download" href="${objectUrl}" download="${safeFileName}">Download</a>
                </div>
                <div class="hint">
                  If preview is not supported for this file type, use Download.
                </div>
                <iframe src="${objectUrl}" title="Submission Preview"></iframe>
              </body>
            </html>
          `);
          previewWindow.document.close();
        }
      } else {
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
      }

      window.setTimeout(() => {
        window.URL.revokeObjectURL(objectUrl);
      }, 10 * 60 * 1000);
    } catch (err: any) {
      if (previewWindow && !previewWindow.closed) {
        previewWindow.close();
      }
      const message = await extractErrorMessage(err);
      alert(message);
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
          <p className="text-[10px] font-black theme-text-primary uppercase tracking-[0.4em]">Task ID: {taskId?.slice(-6)}</p>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-adaptive-main tracking-tighter uppercase leading-none">
            {task?.title || 'Review Submissions'}
          </h1>
          <p className="text-adaptive-sub text-sm font-medium">Review submissions and assign marks.</p>
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
              <p className="text-adaptive-sub font-black uppercase tracking-widest text-[9px] animate-pulse">Loading submissions...</p>
            </div>
          ) : submissions.length === 0 ? (
            <div className="glass-card p-10 sm:p-20 rounded-[32px] text-center border-dashed border-white/10 flex flex-col items-center justify-center gap-4">
              <Search size={32} className="opacity-10" />
              <p className="text-adaptive-sub font-bold text-xs uppercase tracking-widest">No submissions found.</p>
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
                      sub.allowResubmission
                        ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                        : sub.isAutoZero
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/10'
                        : (sub.status === 'evaluated' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10' : 'bg-blue-500/10 text-blue-400 border-blue-500/10')
                    }`}>
                      {sub.status === 'evaluated' || sub.isAutoZero ? <CheckCircle size={10} /> : <div className="w-1.5 h-1.5 rounded-full theme-bg-primary animate-pulse"></div>}
                      {sub.allowResubmission ? 'reopened' : (sub.isAutoZero ? 'missed' : sub.status)}
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
                  <p className="text-[9px] font-black theme-text-primary uppercase tracking-widest">Selected Submission</p>
                  <h2 className="text-2xl font-black text-adaptive-main tracking-tighter uppercase leading-none">
                    Review
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

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest">
                    Reopen Note (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={reopenReasonInput}
                    onChange={(e) => setReopenReasonInput(e.target.value)}
                    disabled={isReopening || isMissedSubmission}
                    placeholder="Reason for asking re-upload (e.g., wrong file uploaded)."
                    className={`w-full bg-adaptive-nested border border-white/10 rounded-2xl py-3 px-4 text-xs text-adaptive-main focus:outline-none focus:theme-border-primary transition-all resize-none ${isMissedSubmission ? 'opacity-60 cursor-not-allowed' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={handleReopenSubmission}
                    disabled={isReopening || isMissedSubmission}
                    className={`w-full rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-indigo-300 transition-all ${isReopening || isMissedSubmission ? 'opacity-60 cursor-not-allowed' : 'hover:bg-indigo-500/20 active:scale-95'}`}
                  >
                    {isReopening
                      ? 'Opening...'
                      : (activeSubmission.allowResubmission ? 'Update Reopen Window' : 'Reopen for Resubmission')}
                  </button>
                </div>

                {activeSubmission.allowResubmission && (
                  <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-xl text-indigo-200 text-[10px] font-bold space-y-1">
                    <p className="uppercase tracking-widest">Resubmission Open</p>
                    {activeSubmission.reopenedAt ? (
                      <p>Opened: {new Date(activeSubmission.reopenedAt).toLocaleString()}</p>
                    ) : null}
                    <p className="leading-relaxed">
                      {activeSubmission.reopenReason || 'Student can upload a corrected file now.'}
                    </p>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest">Grade (0-100)</label>
                    <span className="text-[8px] font-black theme-text-primary uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded">Number</span>
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
                    <label className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest">Feedback</label>
                    {!isEvaluated && !isMissedSubmission && (
                      <button 
                        onClick={getAIEvaluation}
                        disabled={isAILoading || isEvaluated}
                        className="text-[8px] flex items-center gap-2 font-black theme-text-primary hover:text-white transition-all uppercase tracking-widest bg-blue-500/10 hover:theme-bg-primary px-3 py-2 rounded-lg active:scale-95 disabled:opacity-50 shadow-sm"
                      >
                        {isAILoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {isAILoading ? 'Running AI...' : 'AI Assist'}
                      </button>
                    )}
                  </div>
                  
                  <div className="relative">
                    <textarea 
                      rows={6}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      disabled={isEvaluated || isSubmitting}
                      placeholder="Write feedback..."
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
                </div>

                {isEvaluated ? (
                  <div className="w-full bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 font-black uppercase tracking-[0.2em] py-5 rounded-2xl flex items-center justify-center gap-2.5 shadow-sm text-[10px]">
                    <ShieldCheck size={20} />
                    Evaluation Completed
                  </div>
                ) : (
                  <button 
                    onClick={handleCompleteEvaluation}
                    disabled={isSubmitting || isEvaluated}
                    className={`w-full theme-bg-primary hover:opacity-95 text-white font-black uppercase tracking-[0.2em] py-5 rounded-2xl shadow-xl theme-shadow-primary flex items-center justify-center gap-2.5 transition-all active:scale-[0.98] text-[10px] ${isSubmitting ? 'opacity-70' : ''}`}
                  >
                    {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                    Save Evaluation
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-card p-8 sm:p-16 rounded-[32px] sm:rounded-[40px] flex flex-col items-center justify-center text-center xl:sticky xl:top-24 border-dashed border-white/10 border-2">
              <div className="w-20 h-20 bg-adaptive-nested/50 rounded-3xl flex items-center justify-center text-adaptive-sub mb-6 border border-white/5 shadow-inner">
                <Target size={32} className="opacity-10" />
              </div>
              <h3 className="text-lg font-black text-adaptive-sub tracking-tight uppercase">Ready to Review</h3>
              <p className="text-[10px] text-adaptive-sub mt-2 max-w-[180px] leading-relaxed font-bold uppercase tracking-widest opacity-40">Select a submission from the list to start reviewing.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Submissions;
