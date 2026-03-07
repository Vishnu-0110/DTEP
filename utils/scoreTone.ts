export const getScoreTone = (score?: number | null) => {
  if (!Number.isFinite(score)) {
    return {
      valueTextClass: 'text-adaptive-main',
      labelTextClass: 'text-adaptive-sub',
      surfaceClass: 'bg-adaptive-nested/50 border-white/5',
      borderClass: 'border-white/5',
    };
  }

  if ((score as number) >= 81) {
    return {
      valueTextClass: 'text-emerald-400',
      labelTextClass: 'text-emerald-500',
      surfaceClass: 'bg-emerald-500/5 border-emerald-500/10',
      borderClass: 'border-emerald-500/20',
    };
  }

  if ((score as number) >= 35) {
    return {
      valueTextClass: 'text-amber-400',
      labelTextClass: 'text-amber-500',
      surfaceClass: 'bg-amber-500/5 border-amber-500/10',
      borderClass: 'border-amber-500/20',
    };
  }

  return {
    valueTextClass: 'text-rose-500',
    labelTextClass: 'text-rose-500',
    surfaceClass: 'bg-rose-500/5 border-rose-500/10',
    borderClass: 'border-rose-500/20',
  };
};
