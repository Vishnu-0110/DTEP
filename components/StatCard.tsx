
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  sub: string;
  className?: string;
  valueClassName?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon, sub, className = "", valueClassName = 'text-adaptive-main' }) => {
  return (
    <div className={`glass-card p-5 sm:p-6 rounded-3xl hover:theme-border-primary transition-all group ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="p-3 bg-adaptive-nested rounded-2xl border border-white/10 group-hover:scale-110 transition-transform shadow-sm">
          {icon}
        </div>
        <span className="max-w-full self-start sm:max-w-[60%] sm:self-auto text-[10px] font-black text-adaptive-main/80 px-2.5 py-1.5 bg-adaptive-nested rounded-full border border-white/10 uppercase tracking-widest break-words">
          {sub}
        </span>
      </div>
      <h3 className="text-adaptive-sub text-sm font-bold uppercase tracking-widest">{label}</h3>
      <p className={`text-2xl sm:text-4xl font-black mt-2 tracking-tight drop-shadow-[0_1px_0_rgba(255,255,255,0.08)] break-words ${valueClassName}`}>{value}</p>
    </div>
  );
};

export default StatCard;
