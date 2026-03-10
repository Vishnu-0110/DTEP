import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { Lock, Mail, ChevronRight, Info } from 'lucide-react';
import { getDefaultRouteForRole, getPreferredRouteForUser } from '../utils/navigationPersistence';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.STUDENT);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email, password, role);
      let destination = getDefaultRouteForRole(role);
      try {
        const stored = localStorage.getItem('dtep_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          const userId = String(parsed?.id || '').trim();
          const userRole = String(parsed?.role || role).trim().toLowerCase();
          destination = userId
            ? getPreferredRouteForUser(userId, userRole as UserRole)
            : getDefaultRouteForRole(userRole as UserRole);
        }
      } catch (_) {
        destination = getDefaultRouteForRole(role);
      }
      navigate(destination, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickFill = (e: string, p: string, r: UserRole) => {
    setEmail(e);
    setPassword(p);
    setRole(r);
  };

  return (
    <div className="min-h-screen w-full flex items-start sm:items-center justify-center bg-app p-4 sm:p-6 relative overflow-hidden transition-colors duration-500">
      {/* Background Decorative Elements - Mode Aware */}
      <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-600/5 dark:bg-blue-600/10 blur-[120px] rounded-full"></div>
      <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-indigo-600/5 dark:bg-indigo-600/10 blur-[120px] rounded-full"></div>

      <div className="my-4 w-full max-w-md glass-card rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 lg:p-12 shadow-2xl relative z-10 border border-white/10 animate-in fade-in duration-700">
        <div className="text-center mb-8 sm:mb-10">
          <div className="w-20 h-20 theme-bg-primary rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl theme-shadow-primary text-white">
             <span className="text-3xl font-black italic tracking-tighter">DP</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter mb-2 text-adaptive-main">
            DTE PORTAL
          </h1>
          <p className="text-adaptive-sub font-black text-[10px] uppercase tracking-[0.4em]">Enterprise Access Terminal</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold animate-in slide-in-from-top-2">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3">
            <label className="text-[10px] font-black text-adaptive-sub uppercase tracking-widest ml-1">Access Tier</label>
            <div className="grid grid-cols-1 min-[380px]:grid-cols-3 gap-2 p-1.5 bg-adaptive-nested rounded-2xl border border-white/5">
              {(Object.values(UserRole)).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r as UserRole)}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-[10px] font-black transition-all capitalize uppercase tracking-tighter ${
                    role === r 
                      ? 'theme-bg-primary text-white shadow-lg theme-shadow-primary' 
                      : 'text-adaptive-sub hover:text-adaptive-main hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-5">
            <div className="relative group">
              <div className="absolute inset-y-0 left-5 flex items-center text-adaptive-sub group-focus-within:theme-text-primary transition-colors">
                <Mail size={18} />
              </div>
              <input
                type="email"
                placeholder="Email Identifier"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                className="w-full bg-adaptive-nested border border-white/10 rounded-2xl py-4 pl-14 pr-5 text-adaptive-main placeholder:text-adaptive-sub/50 focus:outline-none focus:ring-2 focus:theme-border-primary transition-all font-medium text-sm"
              />
            </div>

            <div className="relative group">
              <div className="absolute inset-y-0 left-5 flex items-center text-adaptive-sub group-focus-within:theme-text-primary transition-colors">
                <Lock size={18} />
              </div>
              <input
                type="password"
                placeholder="Security Phrase"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                className="w-full bg-adaptive-nested border border-white/10 rounded-2xl py-4 pl-14 pr-5 text-adaptive-main placeholder:text-adaptive-sub/50 focus:outline-none focus:ring-2 focus:theme-border-primary transition-all font-medium text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full theme-bg-primary hover:opacity-90 text-white font-black py-4 rounded-2xl shadow-xl theme-shadow-primary flex items-center justify-center gap-3 group transition-all active:scale-[0.98] uppercase text-[11px] tracking-[0.2em] ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {isSubmitting ? 'Verifying...' : 'Authenticate'}
            {!isSubmitting && <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        <div className="mt-12 pt-8 border-t border-white/5">
          <div className="flex items-center gap-2 text-adaptive-sub text-[10px] font-black uppercase tracking-widest mb-5">
            <Info size={14} className="theme-text-primary" />
            Quick Account Fill
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3">
            {[
              { label: 'Admin', email: 'admin@dtep.com', pass: 'admin12345', role: UserRole.ADMIN },
              { label: 'Evaluator', email: 'evaluator@dtep.com', pass: 'evaluator12345', role: UserRole.EVALUATOR },
 
              { label: 'Student', email: 'student@dtep.com', pass: 'student12345', role: UserRole.STUDENT },
            ].map((demo) => (
              <button 
                key={demo.label}
                onClick={() => quickFill(demo.email, demo.pass, demo.role)}
                className="px-2 py-3 bg-adaptive-nested hover:theme-bg-primary hover:text-white border border-white/5 rounded-xl text-[9px] font-black text-adaptive-sub uppercase tracking-tighter transition-all active:scale-95 shadow-sm"
              >
                {demo.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
