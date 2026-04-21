import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Send, LifeBuoy, AlertCircle, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { HelpdeskQuery, HelpdeskQueryStatus } from '../types';

const formatDateTime = (value?: string) => {
  const date = new Date(String(value || ''));
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const statusLabel = (status?: HelpdeskQueryStatus | string) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'in_progress') return 'In progress';
  if (normalized === 'resolved') return 'Resolved';
  if (normalized === 'closed') return 'Closed';
  return 'Open';
};

const statusTone = (status?: HelpdeskQueryStatus | string) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'resolved' || normalized === 'closed') return 'bg-emerald-500/12 text-emerald-300 border-emerald-500/20';
  if (normalized === 'in_progress') return 'bg-amber-500/12 text-amber-300 border-amber-500/20';
  return 'bg-sky-500/12 text-sky-300 border-sky-500/20';
};

const HelpDesk: React.FC = () => {
  const { user, isDemoMode } = useAuth();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [queries, setQueries] = useState<HelpdeskQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canSubmit = useMemo(() => {
    return String(subject || '').trim().length > 0 && String(message || '').trim().length > 0;
  }, [subject, message]);

  const fetchMyQueries = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/helpdesk/queries/my');
      setQueries(Array.isArray(response.data) ? response.data : []);
    } catch (err: any) {
      if (isDemoMode) {
        setQueries([
          {
            _id: 'demo_query_1',
            subject: 'Demo: Unable to upload submission',
            message: 'I tried uploading my PDF and the portal kept timing out.',
            status: 'in_progress',
            raisedByRole: user?.role,
            raisedByName: user?.name,
            raisedByEmail: user?.email,
            raisedByDepartment: user?.department,
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          } as HelpdeskQuery,
        ]);
      } else {
        setError(err?.response?.data?.message || 'Could not load help desk queries.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMyQueries();
  }, [isDemoMode]);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      if (!isDemoMode) {
        await api.post('/helpdesk/queries', {
          subject: String(subject || '').trim(),
          message: String(message || '').trim(),
        });
      }

      setSubject('');
      setMessage('');
      setSuccess(isDemoMode ? 'Simulated: query raised.' : 'Query raised successfully.');
      void fetchMyQueries();
      window.setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Could not raise query.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-card rounded-3xl p-6 border border-white/10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-adaptive-sub">Support</p>
            <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-adaptive-main">Help Desk</h1>
            <p className="mt-2 text-sm text-adaptive-sub opacity-70">
              Raise a query and track its status. Your department and profile details are included automatically.
            </p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-adaptive-nested border border-white/10 flex items-center justify-center shrink-0">
            <LifeBuoy size={20} className="text-adaptive-main opacity-80" />
          </div>
        </div>

        {(error || success) && (
          <div className="mt-5">
            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 flex items-center gap-2">
                <AlertCircle size={16} className="text-red-300" />
                <p className="text-sm text-red-100">{error}</p>
              </div>
            )}
            {success && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-300" />
                <p className="text-sm text-emerald-100">{success}</p>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="space-y-1">
              <label className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest ml-1">Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                placeholder="Eg: Login issue / Submission upload issue"
                className="w-full surface-input rounded-2xl py-3 px-4 transition-all font-medium text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest ml-1">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={7}
                maxLength={8000}
                placeholder="Describe the issue with steps to reproduce and any relevant details."
                className="w-full bg-adaptive-nested border border-white/10 rounded-2xl py-3 px-4 text-sm text-adaptive-main focus:outline-none focus:theme-border-primary transition-all custom-scrollbar resize-none"
              />
            </div>

            <button
              type="button"
              disabled={!canSubmit || submitting}
              onClick={handleSubmit}
              className={`btn-primary w-full rounded-2xl py-3.5 transition-all flex items-center justify-center gap-2 px-6 uppercase text-[9px] tracking-widest ${(!canSubmit || submitting) ? 'opacity-30 cursor-not-allowed' : 'active:scale-95'}`}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              Raise Query
            </button>

            <div className="rounded-2xl border border-white/10 bg-adaptive-nested/40 px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-adaptive-sub">Submitting As</p>
              <p className="mt-1 text-sm font-bold text-adaptive-main truncate">{user?.name || '—'}</p>
              <p className="text-[11px] font-bold text-adaptive-sub truncate opacity-70">{user?.email || '—'}</p>
              <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-adaptive-sub opacity-60">
                Department: {user?.department || 'Not set'}
              </p>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-adaptive-sub">My Queries</p>
                <p className="text-sm text-adaptive-sub opacity-70 mt-1">
                  {queries.length} total
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchMyQueries()}
                disabled={loading}
                className="rounded-2xl border border-white/10 bg-adaptive-nested px-4 py-2 text-[9px] font-black uppercase tracking-widest text-adaptive-sub hover:text-adaptive-main transition-colors disabled:opacity-50"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="glass-card rounded-3xl border border-white/10 p-6 flex items-center gap-3">
                  <Loader2 size={18} className="animate-spin text-adaptive-sub" />
                  <p className="text-sm text-adaptive-sub">Loading queries...</p>
                </div>
              ) : queries.length === 0 ? (
                <div className="glass-card rounded-3xl border border-white/10 p-6">
                  <p className="text-sm text-adaptive-sub opacity-70">No queries raised yet.</p>
                </div>
              ) : (
                queries.map((query) => (
                  <div key={query._id} className="glass-card rounded-3xl border border-white/10 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-adaptive-main break-words">{query.subject}</p>
                        <p className="mt-2 text-[11px] text-adaptive-sub opacity-70 whitespace-pre-line break-words">
                          {query.message}
                        </p>
                        <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-adaptive-sub opacity-60">
                          Raised {formatDateTime(query.createdAt)}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest border rounded-2xl px-3 py-1 ${statusTone(query.status)}`}>
                        {statusLabel(query.status)}
                      </span>
                    </div>
                    {String(query.adminNotes || '').trim() && (
                      <div className="mt-4 rounded-2xl border border-white/10 bg-adaptive-nested/50 p-4">
                        <p className="text-[9px] font-black uppercase tracking-widest text-adaptive-sub">Admin Notes</p>
                        <p className="mt-2 text-[11px] text-adaptive-sub opacity-70 whitespace-pre-line break-words">
                          {String(query.adminNotes || '').trim()}
                        </p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HelpDesk;

