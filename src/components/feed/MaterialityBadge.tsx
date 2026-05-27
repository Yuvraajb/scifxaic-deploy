import React from 'react';
import type { MaterialityLevel } from '../../types';

const CONFIG: Record<MaterialityLevel, { emoji: string; label: string; className: string }> = {
  High: {
    emoji: '🔴',
    label: 'High',
    className: 'bg-red-100 text-red-700 border border-red-200',
  },
  Medium: {
    emoji: '🟡',
    label: 'Medium',
    className: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  },
  Low: {
    emoji: '🟢',
    label: 'Low',
    className: 'bg-green-100 text-green-700 border border-green-200',
  },
  Pending: {
    emoji: '⏳',
    label: 'Classifying…',
    className: 'bg-gray-100 text-gray-500 border border-gray-200',
  },
};

interface Props {
  level: MaterialityLevel;
}

export const MaterialityBadge: React.FC<Props> = ({ level }) => {
  const { emoji, label, className } = CONFIG[level];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${className}`}>
      {emoji} {label}
    </span>
  );
};
