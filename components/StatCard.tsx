
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
    <div className={`glass-card p-6 rounded-3xl hover:theme-border-primary transition-all group ${className}`}>
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-adaptive-nested rounded-2xl border border-white/10 group-hover:scale-110 transition-transform shadow-sm">
          {icon}
        </div>
        <span className="text-[10px] font-black text-adaptive-main/80 px-2.5 py-1.5 bg-adaptive-nested rounded-full border border-white/10 uppercase tracking-widest">
          {sub}
        </span>
      </div>
      <h3 className="text-adaptive-sub text-sm font-bold uppercase tracking-widest">{label}</h3>
      <p className={`text-3xl sm:text-4xl font-black mt-2 tracking-tight drop-shadow-[0_1px_0_rgba(255,255,255,0.08)] ${valueClassName}`}>{value}</p>
    </div>
  );
};

export default StatCard;
