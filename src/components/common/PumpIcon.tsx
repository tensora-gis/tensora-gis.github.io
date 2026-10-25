import React from 'react';

export const PumpToolIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="8" />
    <polygon points="9,8 16,12 9,16" fill="currentColor" stroke="none" />
  </svg>
);
