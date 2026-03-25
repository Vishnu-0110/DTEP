import React, { useState, useEffect } from 'react';
import {
  Calendar, 
  Clock, 
  Upload, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  FileText
} from 'lucide-react';
import api from '../services/api';
import { getScoreTone } from '../utils/scoreTone';
import ModalShell from '../components/ModalShell';

const formatDeadlineDateTime = (deadline: string | Date) => {
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

const formatCountdown = (deadlineMs: number, nowMs: number) => {
  if (!Number.isFinite(deadlineMs)) return 'Unknown';

  const diff = deadlineMs - nowMs;
  if (diff < 0) return 'Overdue';
  const totalSeconds = Math.floor(diff / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const getDisplayStatus = (task: any, nowMs: number): 'assigned' | 'reopened' | 'pending' | 'evaluated' | 'overdue' | 'missed' => {
  if (task.isAutoZero) return 'missed';
  if (task.hasSubmission && task.allowResubmission) return 'reopened';
  if (task.hasSubmission && task.reviewStatus === 'evaluated') return 'evaluated';
  if (task.hasSubmission) return 'pending';
  const deadlineMs = new Date(task.deadline).getTime();
  if (Number.isFinite(deadlineMs) && nowMs > deadlineMs) return 'overdue';
  return 'assigned';
};

const DEFAULT_RUBRIC_GUIDANCE = [
  'Use clear section headings that match the assignment rubric',
  'Cover all required sections with sufficient depth',
  'Add relevant examples/applications only when required by the topic',
  'Conclude clearly and include credible references',
];
const FEEDBACK_PREVIEW_MAX_CHARS = 220;

const toFeedbackPreview = (value: string, maxChars = FEEDBACK_PREVIEW_MAX_CHARS) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trimEnd()}...`;
};

const StudentTasks: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [nowMs, setNowMs] = useState(Date.now());
  const [isFeedbackPreviewOpen, setIsFeedbackPreviewOpen] = useState(false);
  const [feedbackPreviewTitle, setFeedbackPreviewTitle] = useState('');
  const [feedbackPreviewText, setFeedbackPreviewText] = useState('');

  const getAssignedTaskTime = (task: any) => {
    const createdAtMs = new Date(task?.createdAt || 0).getTime();
    if (Number.isFinite(createdAtMs) && createdAtMs > 0) return createdAtMs;

    const deadlineMs = new Date(task?.deadline || 0).getTime();
    if (Number.isFinite(deadlineMs) && deadlineMs > 0) return deadlineMs;

    return 0;
  };

  const sortTasksByAssignedOrder = (items: any[]) => {
    return [...(items || [])].sort((a, b) => getAssignedTaskTime(b) - getAssignedTaskTime(a));
  };

  const fetchTasks = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [tasksRes, submissionsRes] = await Promise.all([
        api.get('/tasks'),
        api.get('/submissions/my-submissions')
      ]);

      const submissionsByTask = new Map<string, any>();
      for (const sub of submissionsRes.data || []) {
        const taskId =
          (typeof sub.taskId === 'string' ? sub.taskId : sub.taskId?._id) ||
          (typeof sub.task === 'string' ? sub.task : sub.task?._id);
        if (taskId && !submissionsByTask.has(String(taskId))) {
          submissionsByTask.set(String(taskId), sub);
        }
      }

      const mappedTasks = (tasksRes.data || []).map((task: any) => {
        const taskId = String(task._id);
        const submission = submissionsByTask.get(taskId);

        return {
          ...task,
          teacher: task.createdBy?.name || 'Evaluator',
          hasSubmission: Boolean(submission),
          reviewStatus: submission?.status || null,
          marks: submission?.marks,
          feedback: submission?.feedback || submission?.remarks || '',
          submittedAt: submission?.submittedAt || null,
          isAutoZero: Boolean(submission?.isAutoZero),
          allowResubmission: Boolean(submission?.allowResubmission),
          reopenReason: String(submission?.reopenReason || '').trim(),
          reopenedAt: submission?.reopenedAt || null,
          resubmissionCount: Number(submission?.resubmissionCount || 0),
          requiredPages: Number(task?.requiredPages || 0),
          rubricText: String(task?.rubricText || '').trim(),
        };
      });

      setTasks(sortTasksByAssignedOrder(mappedTasks));
    } catch (err: any) {
      if (!err.response) {
        setError('Cannot reach backend API. Verify VITE_API_URL or your same-origin /api proxy configuration.');
      } else {
        setError(err.response?.data?.message || 'Failed to load assigned tasks.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedTask) return;

    setUploading(true);
    setSuccessMessage('');
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('answer', answerText);
    const uploadedFileName = selectedFile.name;

    try {
      const response = await api.post(`/submissions/${selectedTask._id}/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const serverSubmission = response?.data?.submission || response?.data || {};
      
      setTasks(prev =>
        prev.map(t =>
          t._id === selectedTask._id
            ? {
                ...t,
                hasSubmission: true,
                reviewStatus: serverSubmission.status || 'pending',
                submittedAt: serverSubmission.submittedAt || new Date().toISOString(),
                isAutoZero: false,
                marks: typeof serverSubmission.marks === 'number' ? serverSubmission.marks : null,
                feedback: serverSubmission.feedback || serverSubmission.remarks || '',
                allowResubmission: Boolean(serverSubmission.allowResubmission),
                reopenReason: String(serverSubmission.reopenReason || ''),
                reopenedAt: serverSubmission.reopenedAt || null,
                resubmissionCount: Number(serverSubmission.resubmissionCount || t.resubmissionCount || 0),
              }
            : t
        )
      );
      const successNotice = String(response?.data?.message || '').trim();
      setSuccessMessage(successNotice || `File uploaded successfully: ${uploadedFileName}`);
      setTimeout(() => setSuccessMessage(''), 4000);
      
      setTimeout(() => {
        setIsUploadModalOpen(false);
        setSelectedFile(null);
        setAnswerText('');
        setUploading(false);
      }, 1000);
    } catch (err: any) {
      if (err.response?.status === 409) {
        const existingSubmission = err.response?.data?.submission || {};
        setTasks(prev =>
          prev.map(t =>
            t._id === selectedTask._id
              ? {
                  ...t,
                  hasSubmission: true,
                  reviewStatus: existingSubmission.status || 'pending',
                  marks: existingSubmission.marks,
                  feedback: existingSubmission.feedback,
                  submittedAt: existingSubmission.submittedAt || t.submittedAt,
                  isAutoZero: Boolean(existingSubmission.isAutoZero),
                  allowResubmission: Boolean(existingSubmission.allowResubmission),
                  reopenReason: String(existingSubmission.reopenReason || ''),
                  reopenedAt: existingSubmission.reopenedAt || null,
                  resubmissionCount: Number(existingSubmission.resubmissionCount || t.resubmissionCount || 0),
                }
              : t
          )
        );
        setSuccessMessage(err.response?.data?.message || 'Task already submitted.');
        setTimeout(() => setSuccessMessage(''), 4000);
        setIsUploadModalOpen(false);
        setSelectedFile(null);
        setAnswerText('');
      } else {
        const errorCode = String(err?.code || '').trim().toUpperCase();
        const errorMessage = String(err?.message || '').trim().toLowerCase();
        const isTimeout = errorCode === 'ECONNABORTED' || errorMessage.includes('timeout');
        const fallbackMessage = isTimeout
          ? 'Upload timed out while backend was processing. Please retry once.'
          : 'Upload failed. Ensure backend is running.';
        alert(err.response?.data?.message || fallbackMessage);
      }
      setUploading(false);
    }
  };

  const openFeedbackPreview = (taskTitle: string, feedbackText: string) => {
    setFeedbackPreviewTitle(String(taskTitle || 'Assignment Feedback').trim() || 'Assignment Feedback');
    setFeedbackPreviewText(String(feedbackText || '').trim());
    setIsFeedbackPreviewOpen(true);
  };

  return (
    <div className="space-y-6 lg:space-y-10 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-adaptive-main tracking-tighter">My Assignments</h1>
          <p className="text-adaptive-sub font-medium text-sm sm:text-base">Current assignments and review status.</p>
        </div>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 w-full sm:w-auto">
          <div className="glass-card px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest border-l-4 border-l-emerald-500 flex items-center justify-center gap-2">
            <CheckCircle2 size={12} className="text-emerald-500" />
            {tasks.filter(t => t.hasSubmission && !t.isAutoZero).length} Submitted
          </div>
          <div className="glass-card px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest border-l-4 border-l-blue-500 flex items-center justify-center gap-2">
            <Clock size={12} className="text-blue-500" />
            {tasks.filter(t => getDisplayStatus(t, nowMs) === 'assigned').length} Due
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-red-500 text-[11px] font-bold">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}
      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex items-center gap-3 text-emerald-500 text-[11px] font-bold">
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin theme-text-primary" size={40} />
          <p className="text-adaptive-sub font-black uppercase tracking-widest text-[9px] animate-pulse">Loading assignments...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
          {tasks.map((task) => {
            const deadlineMs = new Date(task.deadline).getTime();
            const displayStatus = getDisplayStatus(task, nowMs);
            const scoreTone = getScoreTone(task.marks);

            return (
            <div key={task._id} className="glass-card rounded-[32px] p-6 sm:p-7 relative group border border-white/5 hover:theme-border-primary transition-all flex flex-col shadow-sm hover:shadow-xl">
              <div className="flex justify-between items-start mb-6">
                <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors duration-300 ${
                  displayStatus === 'evaluated' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/10' :
                  displayStatus === 'missed' ? 'bg-rose-500/10 text-rose-500 border-rose-500/10' :
                  displayStatus === 'reopened' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                  displayStatus === 'pending' ? 'bg-amber-500/10 text-amber-500 border-amber-500/10' :
                  displayStatus === 'overdue' ? 'bg-rose-500/10 text-rose-500 border-rose-500/10' : 'bg-blue-500/10 text-blue-500 border-blue-500/10'
                }`}>
                  {displayStatus}
                </div>
                {task.priority === 'high' && displayStatus === 'assigned' && (
                  <div className="text-rose-500 animate-pulse">
                    <AlertCircle size={18} />
                  </div>
                )}
              </div>

              <h3 className="text-xl font-black text-adaptive-main mb-2 tracking-tight group-hover:theme-text-primary transition-colors break-words leading-snug">
                {task.title}
              </h3>
              <p className="text-[11px] text-adaptive-sub mb-8 font-bold flex items-center gap-1.5 opacity-80 italic">
                 By {task.teacher || 'Evaluator'}
              </p>

              <div className="mt-auto space-y-6">
                <div className="bg-adaptive-nested p-3 rounded-2xl border border-white/5 space-y-2">
                  <div className="flex items-start justify-between gap-3 text-[10px] font-black uppercase tracking-widest">
                    <span className="text-adaptive-sub flex items-center gap-2">
                      <Calendar size={14} className="theme-text-primary" /> Deadline
                    </span>
                    <span className={`text-right leading-snug ${displayStatus === 'overdue' ? 'text-rose-500' : 'text-adaptive-main'}`}>
                      {formatDeadlineDateTime(task.deadline)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[9px] font-black uppercase tracking-widest">
                    <span className="text-adaptive-sub">Countdown</span>
                    <span className={`text-right ${displayStatus === 'overdue' ? 'text-rose-500' : 'theme-text-primary'}`}>
                      {formatCountdown(deadlineMs, nowMs)}
                    </span>
                  </div>
                </div>

                {displayStatus === 'assigned' || displayStatus === 'reopened' ? (
                  <button 
                    onClick={() => { setSelectedTask(task); setAnswerText(''); setIsUploadModalOpen(true); }}
                    className="w-full theme-bg-primary hover:opacity-95 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-xl theme-shadow-primary active:scale-95 text-[9px] uppercase tracking-widest"
                  >
                    <Upload size={18} />
                    {displayStatus === 'reopened' ? 'Re-upload Document' : 'Upload Document'}
                  </button>
                ) : displayStatus === 'pending' ? (
                  <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Pending</span>
                      <span className="text-lg font-black text-amber-500">--</span>
                    </div>
                    <p className="text-[10px] text-adaptive-sub font-medium italic opacity-70 whitespace-pre-line break-words">
                        Submission received. Evaluation is pending.
                    </p>
                  </div>
                ) : displayStatus === 'missed' ? (
                  <div className="p-4 rounded-2xl border border-rose-500/20 bg-rose-500/10">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-[9px] font-black uppercase tracking-widest text-rose-500">Missed</span>
                      <span className="text-lg font-black text-rose-500">0%</span>
                    </div>
                    <p className="text-[10px] text-adaptive-sub font-medium italic opacity-80 break-words leading-relaxed line-clamp-3">
                      {toFeedbackPreview(task.feedback || 'Deadline missed. The system automatically assigned 0 marks.')}
                    </p>
                    <button
                      type="button"
                      onClick={() => openFeedbackPreview(task.title, task.feedback || 'Deadline missed. The system automatically assigned 0 marks.')}
                      className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-rose-400 transition-all hover:bg-rose-500/20 active:scale-95"
                    >
                      Preview
                    </button>
                  </div>
                ) : displayStatus === 'evaluated' ? (
                  <div className={`p-4 rounded-2xl border ${scoreTone.surfaceClass}`}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className={`text-[9px] font-black uppercase tracking-widest ${scoreTone.labelTextClass}`}>Marked</span>
                      <span className={`text-lg font-black ${scoreTone.valueTextClass}`}>{typeof task.marks === 'number' ? task.marks : '--'}%</span>
                    </div>
                    <p className="text-[10px] text-adaptive-sub font-medium italic opacity-70 break-words leading-relaxed line-clamp-3">
                        {toFeedbackPreview(task.feedback || 'System audit in progress...')}
                    </p>
                    <button
                      type="button"
                      onClick={() => openFeedbackPreview(task.title, task.feedback || 'System audit in progress...')}
                      className="mt-3 rounded-xl border border-white/20 bg-adaptive-nested px-3 py-1.5 text-[9px] font-black uppercase tracking-widest theme-text-primary transition-all hover:theme-bg-primary hover:text-white active:scale-95"
                    >
                      Preview
                    </button>
                  </div>
                ) : (
                  <div className="w-full bg-adaptive-nested text-adaptive-sub font-black py-4 rounded-2xl text-center text-[9px] uppercase tracking-widest opacity-40 italic">
                    Deadline Passed
                  </div>
                )}

                {displayStatus === 'reopened' && (
                  <div className="p-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/10">
                    <p className="text-[9px] font-black uppercase tracking-widest text-indigo-300">
                      Resubmission Window Open
                    </p>
                    <p className="mt-1 text-[10px] text-adaptive-sub font-medium leading-relaxed whitespace-pre-line break-words">
                      {task.reopenReason || 'Evaluator requested a corrected file upload for this submission.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )})}
        </div>
      )}

      <ModalShell
        isOpen={isUploadModalOpen}
        onClose={() => {
          if (!uploading) {
            setIsUploadModalOpen(false);
            setAnswerText('');
          }
        }}
      >
        <div className="modal-surface rounded-[32px] sm:rounded-[40px] p-5 sm:p-8 lg:p-10 w-full max-w-5xl max-h-[calc(100dvh-2rem)] sm:max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-300">
          <div className="text-center mb-6 sm:mb-8">
            <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500 mx-auto mb-4 border border-blue-500/10 shadow-sm">
              <Upload size={24} />
            </div>
            <h2 className="text-2xl font-black text-adaptive-main tracking-tighter uppercase leading-none">Submit Assignment</h2>
            <p className="text-adaptive-sub text-[10px] font-black uppercase tracking-widest mt-2">{selectedTask?.title}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
            <div className="bg-adaptive-nested/50 border border-white/10 rounded-3xl p-5 space-y-3 max-h-[45dvh] lg:max-h-[58vh] overflow-y-auto custom-scrollbar pr-1">
              <p className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest">AI Rubric Guidance</p>
              {selectedTask?.rubricText ? (
                <p className="text-xs text-adaptive-main font-bold leading-relaxed whitespace-pre-line break-words">
                  {selectedTask.rubricText}
                </p>
              ) : (
                <>
                  <ul className="space-y-1 list-disc pl-5">
                    {DEFAULT_RUBRIC_GUIDANCE.map((heading) => (
                      <li key={heading} className="text-xs text-adaptive-main font-bold">
                        {heading}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-adaptive-sub font-bold">
                    Rubric sections are topic-specific. Follow the assignment rubric shown above.
                  </p>
                </>
              )}
              {Number(selectedTask?.requiredPages || 0) > 0 && (
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                  Required length: at least {Number(selectedTask.requiredPages)} page(s) in PDF.
                </p>
              )}
            </div>

            <div className="space-y-6">
              <div className={`border-2 border-dashed rounded-3xl p-6 sm:p-12 text-center transition-all group cursor-pointer ${selectedFile ? 'theme-border-primary bg-adaptive-nested' : 'border-white/10 hover:theme-border-primary hover:bg-black/5 dark:hover:bg-white/5'}`}>
                <input 
                  type="file" 
                  id="fileInput" 
                  className="hidden" 
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx"
                />
                <label htmlFor="fileInput" className="cursor-pointer block">
                  <div className="flex flex-col items-center gap-4">
                    <span className={`p-4 rounded-2xl transition-all shadow-md ${selectedFile ? 'theme-bg-primary text-white' : 'bg-adaptive-nested group-hover:scale-105'}`}>
                      {selectedFile ? <CheckCircle2 size={24} /> : <FileText size={24} />}
                    </span>
                    <span className="font-bold text-adaptive-main tracking-tight text-sm break-all text-center">
                      {selectedFile ? selectedFile.name : 'Select file to upload'}
                    </span>
                    <span className="text-[9px] text-adaptive-sub font-black uppercase tracking-widest opacity-60">
                      PDF, DOCX (Max 10MB)
                    </span>
                  </div>
                </label>
              </div>

              <textarea
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Optional: paste answer text for better AI review."
                rows={5}
                className="w-full bg-adaptive-nested border border-white/10 rounded-2xl py-3 px-4 text-sm text-adaptive-main focus:outline-none focus:theme-border-primary transition-all custom-scrollbar resize-none"
              />

              <div className="flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => { setIsUploadModalOpen(false); setAnswerText(''); }} 
                  disabled={uploading}
                  className="flex-1 py-4 btn-secondary rounded-2xl font-black uppercase tracking-widest text-[9px] transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleUpload}
                  disabled={!selectedFile || uploading}
                  className={`flex-1 btn-primary rounded-2xl py-4 transition-all flex items-center justify-center gap-2 px-8 text-[9px] uppercase tracking-widest ${(!selectedFile || uploading) ? 'opacity-30 cursor-not-allowed' : 'active:scale-95'}`}
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        isOpen={isFeedbackPreviewOpen}
        onClose={() => setIsFeedbackPreviewOpen(false)}
      >
        <div className="modal-surface rounded-[32px] sm:rounded-[40px] p-5 sm:p-8 w-full max-w-2xl max-h-[calc(100dvh-2rem)] sm:max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-300">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-adaptive-sub">Remarks Preview</p>
              <h3 className="mt-1 text-lg sm:text-xl font-black tracking-tight text-adaptive-main break-words">
                {feedbackPreviewTitle}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setIsFeedbackPreviewOpen(false)}
              className="rounded-xl border border-white/10 bg-adaptive-nested px-3 py-2 text-[9px] font-black uppercase tracking-widest text-adaptive-sub hover:text-adaptive-main transition-colors"
            >
              Close
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-adaptive-nested/50 p-4 sm:p-5">
            <p className="text-sm text-adaptive-main leading-relaxed whitespace-pre-line break-words">
              {feedbackPreviewText || 'No remarks available.'}
            </p>
          </div>
        </div>
      </ModalShell>
    </div>
  );
};

export default StudentTasks;
