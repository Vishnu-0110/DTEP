
import React, { useEffect, useState } from 'react';
import { X, Calendar, Edit3, Type } from 'lucide-react';
import ModalShell from './ModalShell';

const INITIAL_FORM_DATA = {
  title: '',
  description: '',
  deadline: '',
  requiredPages: '',
};

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
}

const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  useEffect(() => {
    if (!isOpen) {
      setFormData(INITIAL_FORM_DATA);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    setFormData(INITIAL_FORM_DATA);
    onClose();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={handleClose}
    >
      <div
        className="modal-surface rounded-[24px] p-4 sm:p-5 lg:p-6 w-full max-w-md max-h-[calc(100dvh-2rem)] sm:max-h-[84vh] overflow-y-auto custom-scrollbar animate-in zoom-in duration-300 border border-white/15"
        style={{ background: 'rgba(var(--bg-sidebar), 0.9)', backdropFilter: 'blur(14px)' }}
      >
          <div className="flex justify-between items-start mb-5">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-xl theme-bg-primary flex items-center justify-center text-white shadow-xl theme-shadow-primary">
                  <Edit3 size={18} />
               </div>
               <div>
                  <h2 className="text-lg sm:text-xl font-black text-adaptive-main tracking-tight leading-none">Create Task</h2>
                  <p className="text-adaptive-sub text-[9px] font-black uppercase tracking-widest mt-1.5">Create a new assignment</p>
               </div>
            </div>
            <button onClick={handleClose} className="p-2 text-adaptive-sub hover:text-adaptive-main hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all active:scale-90">
              <X size={18} />
            </button>
          </div>

          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(formData); }}>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 ml-1 mb-1">
                 <Type size={12} className="theme-text-primary" />
                 <label className="text-[10px] font-black text-adaptive-sub uppercase tracking-widest">Assignment Title</label>
              </div>
              <input 
                type="text" 
                required
                placeholder="e.g. Advanced Calculus Workshop"
                className="w-full surface-input rounded-xl py-3 px-3.5 transition-all font-medium text-sm" 
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 ml-1 mb-1">
                 <Edit3 size={12} className="theme-text-primary" />
                 <label className="text-[10px] font-black text-adaptive-sub uppercase tracking-widest">Assignment Description</label>
              </div>
              <textarea 
                rows={3}
                required
                placeholder="Write the assignment question or topic..."
                className="w-full surface-input rounded-xl py-3 px-3.5 transition-all font-medium resize-none leading-relaxed text-sm custom-scrollbar"
                value={formData.description}
                onChange={e => setFormData({...formData, description: e.target.value})}
              ></textarea>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 ml-1 mb-1">
                 <Calendar size={12} className="theme-text-primary" />
                 <label className="text-[10px] font-black text-adaptive-sub uppercase tracking-widest">Deadline</label>
              </div>
              <input 
                type="datetime-local" 
                required
                className="w-full surface-input rounded-xl py-3 px-3.5 transition-all font-bold text-sm"
                value={formData.deadline}
                onChange={e => setFormData({...formData, deadline: e.target.value})}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2 ml-1 mb-1">
                 <Type size={12} className="theme-text-primary" />
                 <label className="text-[10px] font-black text-adaptive-sub uppercase tracking-widest">Required Pages (Optional)</label>
              </div>
              <input 
                type="number"
                min={1}
                max={500}
                placeholder="e.g. 5"
                className="w-full surface-input rounded-xl py-3 px-3.5 transition-all font-bold text-sm"
                value={formData.requiredPages}
                onChange={e => setFormData({...formData, requiredPages: e.target.value})}
              />
              <p className="text-[9px] text-adaptive-sub font-bold uppercase tracking-widest opacity-60">
                AI rubric will be generated automatically from title and description.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button type="button" onClick={handleClose} className="flex-1 btn-secondary rounded-xl py-3 font-black text-[9px] uppercase tracking-widest transition-all active:scale-95 order-2 sm:order-1">Cancel</button>
              <button type="submit" className="flex-1 btn-primary rounded-xl py-3 font-black transition-all text-[9px] uppercase tracking-[0.2em] active:scale-95 order-1 sm:order-2">Create Assignment</button>
            </div>
          </form>
      </div>
    </ModalShell>
  );
};

export default TaskModal;
