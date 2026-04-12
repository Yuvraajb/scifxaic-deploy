import React from 'react';

export const LoadingSkeleton: React.FC = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded w-1/4" />
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-200 rounded w-full" />
          </div>
          <div className="h-6 w-20 bg-gray-200 rounded-full" />
        </div>
      </div>
    ))}
  </div>
);
