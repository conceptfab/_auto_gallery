import React from 'react';
import { createPortal } from 'react-dom';

interface LoadingOverlayProps {
  message: string;
  showProgressBar?: boolean;
  progress?: number; // 0-100
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  message,
  showProgressBar = true,
  progress,
}) => {
  const progressBar = showProgressBar ? (
    <div
      className="loading-progress-bar"
      style={{
        width:
          progress !== undefined
            ? `${Math.max(0, Math.min(100, progress))}%`
            : undefined,
      }}
    />
  ) : null;

  const overlay = (
    <div className="loading-overlay">
      <div className="loading-message">{message}</div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return (
      <>
        {progressBar && createPortal(progressBar, document.body)}
        {overlay}
      </>
    );
  }

  return (
    <>
      {progressBar}
      {overlay}
    </>
  );
};

export default LoadingOverlay;
