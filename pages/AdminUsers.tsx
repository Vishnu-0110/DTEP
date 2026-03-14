
import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import { Plus, Search, Trash2, Mail, User as UserIcon, Loader2, ShieldAlert, AlertCircle, Building, CheckCircle, Wrench } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import ModalShell from '../components/ModalShell';

const getRequestErrorMessage = (error: any, fallback: string) => {
  if (error?.response?.status === 401) {
    return 'Your session expired. Log in again as an admin and retry.';
  }

  if (error?.response?.status === 403) {
    return error.response?.data?.message || 'Only admin accounts can change maintenance mode.';
  }

  if (!error?.response) {
    return 'Could not reach the backend while saving maintenance mode.';
  }

  return error.response?.data?.message || fallback;
};

const AdminUsers: React.FC = () => {
  const { user: currentUser, isDemoMode } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [maintenanceError, setMaintenanceError] = useState('');
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: UserRole.STUDENT,
    department: ''
  });

  const fetchUsers = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await api.get('/auth/users');
      setUsers(response.data);
    } catch (err: any) {
      if (isDemoMode) {
        setUsers([
          { _id: 'mock_admin_1', name: 'System Administrator', email: 'admin@dtep.com', role: 'admin', department: 'IT' },
          { _id: 'mock_eval_1', name: 'Professor Jane Smith', email: 'evaluator@dtep.com', role: 'evaluator', department: 'CS' },
          { _id: 'mock_stud_1', name: 'John Doe', email: 'student@dtep.com', role: 'student', department: 'Engineering' },
        ]);
      } else {
        setError('Could not load users. Ensure backend is active.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMaintenanceStatus = async () => {
    if (currentUser?.role !== 'admin') return;
    setMaintenanceError('');
    try {
      const response = await api.get('/system/maintenance');
      setMaintenanceEnabled(Boolean(response.data?.enabled));
      setMaintenanceMessage(String(response.data?.message || ''));
    } catch (err: any) {
      setMaintenanceError(err.response?.data?.message || 'Unable to load maintenance control.');
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchMaintenanceStatus();
  }, [isDemoMode, currentUser?.role]);

  const handleSaveMaintenance = async () => {
    setError('');
    setSuccess('');
    setMaintenanceError('');
    setIsSavingMaintenance(true);
    const nextEnabled = maintenanceEnabled;
    const nextMessage = String(maintenanceMessage || '').trim();

    try {
      const response = await api.put('/system/maintenance', {
        enabled: nextEnabled,
        message: nextMessage,
      });

      setMaintenanceEnabled(Boolean(response.data?.enabled));
      setMaintenanceMessage(String(response.data?.message || ''));
      setSuccess(response.data?.enabled ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      try {
        const statusResponse = await api.get('/system/maintenance');
        const persistedEnabled = Boolean(statusResponse.data?.enabled);
        const persistedMessage = String(statusResponse.data?.message || '').trim();

        if (persistedEnabled === nextEnabled && persistedMessage === nextMessage) {
          setMaintenanceEnabled(persistedEnabled);
          setMaintenanceMessage(String(statusResponse.data?.message || ''));
          setSuccess(persistedEnabled
            ? 'Maintenance mode enabled.'
            : 'Maintenance mode disabled.');
          setTimeout(() => setSuccess(''), 3000);
          return;
        }
      } catch (_) {
        // If the verification request also fails, keep the original error path below.
      }

      setMaintenanceError(getRequestErrorMessage(err, 'Failed to update maintenance mode.'));
    } finally {
      setIsSavingMaintenance(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!userId) return;
    const targetId = String(userId);
    const currentId = String(currentUser?.id || '');

    if (targetId === currentId || targetId === 'mock_admin_1' || targetId === 'admin@dtep.com') {
      alert("Action Restricted: You cannot delete the active administrator or the root system account.");
      return;
    }

    if (!window.confirm('Warning: This user will be permanently removed from the portal. Continue?')) return;
    
    setDeletingIds(prev => new Set(prev).add(targetId));
    setError('');
    setSuccess('');

    try {
      await api.delete(`/auth/users/${targetId}`);
      setUsers(prev => prev.filter(u => String(u._id || u.id) !== targetId));
      setSuccess('User profile successfully removed.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'The server rejected the deletion request.';
      setError(msg);
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await api.post('/auth/register', formData);
      setSuccess(isDemoMode ? 'Simulated: User created in session' : 'Account successfully created.');
      
      if (isDemoMode) {
        const newUser = { _id: `mock_${Date.now()}`, ...formData };
        setUsers(prev => [newUser, ...prev]);
      } else {
        fetchUsers();
      }

      setTimeout(() => {
        setIsModalOpen(false);
        setSuccess('');
        setFormData({ name: '', email: '', password: '', role: UserRole.STUDENT, department: '' });
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create user. Email may already be in use.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-adaptive-main tracking-tighter">User Management</h1>
          <p className="text-adaptive-sub text-sm font-medium">Manage user accounts.</p>
        </div>
        <button 
          onClick={() => { setError(''); setSuccess(''); setIsModalOpen(true); }}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl active:scale-95 w-full sm:w-auto"
        >
          <Plus size={18} />
          Add User
        </button>
      </div>

      <div className="space-y-3">
        {isDemoMode && (
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex items-center gap-3 text-blue-500 text-[11px] font-bold">
            <ShieldAlert size={18} />
            <span>Sandbox Enabled: Local session mutations only.</span>
          </div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-red-500 text-[11px] font-bold">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex items-center gap-3 text-emerald-500 text-[11px] font-bold">
            <CheckCircle size={18} className="theme-text-primary" />
            <span>{success}</span>
          </div>
        )}
      </div>

      {currentUser?.role === 'admin' && (
        <div className="glass-card rounded-3xl border border-white/5 p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-adaptive-main uppercase tracking-widest flex items-center gap-2">
                <Wrench size={14} className="theme-text-primary" />
                Maintenance Control
              </h3>
              <p className="text-[10px] text-adaptive-sub font-bold uppercase tracking-widest mt-1">
                Shown to students and evaluators in real time
              </p>
            </div>
            <button
              onClick={() => setMaintenanceEnabled((prev) => !prev)}
              className={`w-full sm:w-auto px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                maintenanceEnabled
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-adaptive-nested text-adaptive-sub border-white/10'
              }`}
            >
              {maintenanceEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <textarea
            rows={3}
            value={maintenanceMessage}
            onChange={(e) => setMaintenanceMessage(e.target.value)}
            placeholder="Optional maintenance note for students and evaluators."
            className="w-full surface-input rounded-xl py-3 px-4 transition-all font-medium text-sm resize-none"
          />

          {maintenanceError && (
            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-xl text-red-500 text-[10px] font-bold">
              {maintenanceError}
            </div>
          )}

          <button
            onClick={handleSaveMaintenance}
            disabled={isSavingMaintenance}
            className={`w-full sm:w-auto btn-primary rounded-xl py-3 px-5 text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 ${
              isSavingMaintenance ? 'opacity-70 cursor-not-allowed' : ''
            }`}
          >
            {isSavingMaintenance ? 'Saving...' : 'Save Maintenance Settings'}
          </button>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
        <input
          type="text"
          placeholder="Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-adaptive-nested border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-adaptive-main focus:outline-none focus:ring-2 focus:theme-border-primary transition-all font-medium text-sm"
        />
      </div>

      <div className="glass-card rounded-[32px] overflow-hidden shadow-sm border border-white/5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-10 sm:p-16 gap-4">
            <Loader2 className="animate-spin theme-text-primary" size={40} />
            <p className="text-adaptive-sub font-black uppercase tracking-widest text-[9px] animate-pulse">Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="px-6 py-16 sm:py-20 text-center text-adaptive-sub font-bold text-xs uppercase tracking-widest opacity-40">
            No users found
          </div>
        ) : (
          <>
            <div className="grid gap-4 p-4 md:hidden">
              {filteredUsers.map((u) => {
                const id = String(u._id || u.id);
                const isDeleting = deletingIds.has(id);
                const isSelf = id === String(currentUser?.id || '') || id === 'mock_admin_1' || u.email === 'admin@dtep.com';

                return (
                  <div key={id} className="rounded-3xl border border-white/5 bg-adaptive-nested/40 p-4 space-y-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center border shadow-sm shrink-0 transition-colors duration-300 ${isSelf ? 'theme-bg-primary text-white border-transparent' : 'bg-adaptive-nested text-adaptive-sub border-white/5'}`}>
                        <UserIcon size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-adaptive-main tracking-tight text-sm break-words flex items-center gap-1.5 flex-wrap">
                          {u.name}
                          {isSelf && <span className="text-[7px] bg-blue-500 text-white px-1.5 py-0.5 rounded font-black uppercase">Me</span>}
                        </div>
                        <div className="text-[10px] text-adaptive-sub break-all mt-1">{u.email}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
                      <div>
                        <p className="text-[8px] font-black text-adaptive-sub uppercase tracking-widest mb-1">Role</p>
                        <span className={`inline-flex px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all duration-300 ${
                          u.role === 'admin' ? 'bg-purple-500/10 text-purple-500 border-purple-500/10' :
                          u.role === 'evaluator' ? 'bg-amber-500/10 text-amber-500 border-amber-500/10' : 'bg-blue-500/10 text-blue-500 border-blue-500/10'
                        }`}>
                          {u.role}
                        </span>
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-adaptive-sub uppercase tracking-widest mb-1">Department</p>
                        <div className="text-[11px] font-bold text-adaptive-sub break-words">{u.department || 'GLOBAL'}</div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDelete(id)}
                      disabled={isDeleting || isSelf}
                      className={`w-full p-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                        isSelf ? 'opacity-20 cursor-not-allowed bg-adaptive-nested border border-white/5' :
                        isDeleting ? 'bg-red-500/20 text-red-500 border border-red-500/20' : 'text-adaptive-sub hover:text-red-500 hover:bg-red-500/10 active:scale-95 border border-white/5'
                      }`}
                    >
                      {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      Remove User
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="hidden md:block overflow-x-auto custom-scrollbar">
              <table className="w-full text-left min-w-[650px]">
                <thead>
                  <tr className="border-b border-white/5 bg-adaptive-nested/50">
                    <th className="px-6 py-4 text-[9px] font-black text-adaptive-sub uppercase tracking-widest">Profile</th>
                    <th className="px-6 py-4 text-[9px] font-black text-adaptive-sub uppercase tracking-widest">Role</th>
                    <th className="px-6 py-4 text-[9px] font-black text-adaptive-sub uppercase tracking-widest">Department</th>
                    <th className="px-6 py-4 text-[9px] font-black text-adaptive-sub uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.map((u) => {
                    const id = String(u._id || u.id);
                    const isDeleting = deletingIds.has(id);
                    const isSelf = id === String(currentUser?.id || '') || id === 'mock_admin_1' || u.email === 'admin@dtep.com';

                    return (
                      <tr key={id} className="hover:bg-black/5 dark:hover:bg-white/5 transition-all group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-sm shrink-0 transition-colors duration-300 ${isSelf ? 'theme-bg-primary text-white border-transparent' : 'bg-adaptive-nested text-adaptive-sub border-white/5'}`}>
                              <UserIcon size={18} />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-adaptive-main tracking-tight truncate text-sm flex items-center gap-1.5">
                                {u.name}
                                {isSelf && <span className="text-[7px] bg-blue-500 text-white px-1.5 py-0.5 rounded font-black uppercase">Me</span>}
                              </div>
                              <div className="text-[10px] text-adaptive-sub truncate">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all duration-300 ${
                            u.role === 'admin' ? 'bg-purple-500/10 text-purple-500 border-purple-500/10' :
                            u.role === 'evaluator' ? 'bg-amber-500/10 text-amber-500 border-amber-500/10' : 'bg-blue-500/10 text-blue-500 border-blue-500/10'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-[11px] font-bold text-adaptive-sub truncate max-w-[120px]">{u.department || 'GLOBAL'}</div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleDelete(id)}
                            disabled={isDeleting || isSelf}
                            className={`p-2.5 rounded-xl transition-all ${
                              isSelf ? 'opacity-20 cursor-not-allowed' :
                              isDeleting ? 'bg-red-500/20 text-red-500' : 'text-adaptive-sub hover:text-red-500 hover:bg-red-500/10 active:scale-90 border border-transparent'
                            }`}
                          >
                            {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <ModalShell
        isOpen={isModalOpen}
        onClose={() => {
          if (!isSubmitting) {
            setIsModalOpen(false);
          }
        }}
      >
        <div className="modal-surface rounded-3xl p-6 sm:p-8 w-full max-w-md max-h-[calc(100dvh-2rem)] sm:max-h-[90vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 duration-300">
          <h2 className="text-xl font-black text-adaptive-main tracking-tighter mb-6 uppercase">Add User</h2>
          
          <form className="space-y-4" onSubmit={handleCreateUser}>
            <div className="space-y-1">
              <label className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest ml-1">Name</label>
              <input 
                type="text" 
                required
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full surface-input rounded-xl py-3 px-4 transition-all font-medium text-sm" 
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest ml-1">Role</label>
                <select 
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                  className="w-full surface-input rounded-xl py-3 px-4 transition-all font-bold text-[10px] uppercase"
                >
                  <option value={UserRole.STUDENT}>Student</option>
                  <option value={UserRole.EVALUATOR}>Evaluator</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest ml-1">Department</label>
                <input 
                  type="text" 
                  value={formData.department}
                  onChange={e => setFormData({...formData, department: e.target.value})}
                  className="w-full surface-input rounded-xl py-3 px-4 transition-all font-medium text-sm" 
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest ml-1">Email</label>
              <input 
                type="email" 
                required
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full surface-input rounded-xl py-3 px-4 transition-all font-medium text-sm" 
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-adaptive-sub uppercase tracking-widest ml-1">Password</label>
              <input 
                type="password" 
                required
                value={formData.password}
                onChange={e => setFormData({...formData, password: e.target.value})}
                className="w-full surface-input rounded-xl py-3 px-4 transition-all font-medium text-sm" 
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button 
                type="button" 
                disabled={isSubmitting}
                onClick={() => setIsModalOpen(false)} 
                className="flex-1 py-3.5 btn-secondary rounded-xl font-black text-[9px] uppercase tracking-widest transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="flex-1 btn-primary rounded-xl py-3.5 transition-all flex items-center justify-center gap-2 px-6 uppercase text-[9px] tracking-widest active:scale-95"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : 'Create User'}
              </button>
            </div>
          </form>
        </div>
      </ModalShell>
    </div>
  );
};

export default AdminUsers;
