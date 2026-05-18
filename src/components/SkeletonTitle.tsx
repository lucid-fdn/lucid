import React from 'react';

const SkeletonTitle: React.FC = () => {
  return (
    <div role="status" className="max-w-sm animate-pulse">
      <div className="h-2.5 bg-muted rounded-full w-24"></div>
    </div>
  );
};

export default SkeletonTitle;
